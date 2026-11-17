import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const root = path.dirname(fileURLToPath(import.meta.url));
const usersFile = path.join(root, "private", "users.json");
const sessionLifetime = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const dummySalt = randomBytes(16);

const sendJson = (res, status, value, headers = {}) => {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(JSON.stringify(value));
};

const getRequestBody = async (req) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2048) throw new Error("Request body too large");
  }
  return JSON.parse(body);
};

const getCookie = (req, name) => {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : "";
};

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const getSession = (req) => {
  const token = getCookie(req, "clarus_session");
  if (!token) return null;
  const key = hashToken(token);
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return session;
};

const sessionCookie = (token, maxAge) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Strict";
  return `clarus_session=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure}`;
};

const configuredOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)
);

const getCorsHeaders = (req) => {
  const origin = req.headers.origin;
  if (!origin) return {};
  try {
    const sameOrigin = new URL(origin).host === req.headers.host;
    if (!sameOrigin && !configuredOrigins.has(origin)) return null;
    return {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin"
    };
  } catch {
    return null;
  }
};

const parseUsers = (value) => {
  const records = JSON.parse(value);
  if (!Array.isArray(records) || records.some((record) =>
    typeof record?.username !== "string"
    || typeof record?.salt !== "string"
    || typeof record?.passwordHash !== "string"
  )) {
    throw new Error("Data akun tidak valid.");
  }
  return new Map(records.map((record) => [record.username, record]));
};

const readUsers = async () => {
  try {
    return parseUsers(await readFile(usersFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      if (process.env.CLARUS_USERS_JSON) return parseUsers(process.env.CLARUS_USERS_JSON);
      throw new Error("Akun belum tersedia. Lokal jalankan `npm run create-accounts`; di hosting isi variabel CLARUS_USERS_JSON.");
    }
    throw error;
  }
};

const serveFile = async (res, filePath, contentType) => {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { message: "Halaman tidak ditemukan." });
      return;
    }
    throw error;
  }
};

const app = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname.startsWith("/api/")) {
      const corsHeaders = getCorsHeaders(req);
      if (corsHeaders === null) {
        sendJson(res, 403, { message: "Origin tidak diizinkan." });
        return;
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          ...corsHeaders,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600"
        });
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/api/session") {
        const session = getSession(req);
        sendJson(res, 200, session
          ? { authenticated: true, username: session.username }
          : { authenticated: false }, corsHeaders);
        return;
      }

      if (req.method === "POST" && pathname === "/api/login") {
        const address = req.socket.remoteAddress ?? "unknown";
        const now = Date.now();
        const attempt = loginAttempts.get(address);
        if (attempt && attempt.resetAt > now && attempt.count >= 8) {
          sendJson(res, 429, { message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, corsHeaders);
          return;
        }

        const body = await getRequestBody(req);
        const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
        const code = typeof body?.code === "string" ? body.code : "";
        if (username.length > 80 || code.length > 200) {
          sendJson(res, 400, { message: "Username atau kode tidak valid." }, corsHeaders);
          return;
        }

        const users = await readUsers();
        const user = users.get(username);
        const salt = user ? Buffer.from(user.salt, "base64") : dummySalt;
        const expected = user ? Buffer.from(user.passwordHash, "base64") : Buffer.alloc(64);
        const actual = await scrypt(code, salt, 64);
        const valid = user && timingSafeEqual(actual, expected);

        if (!valid) {
          if (!attempt || attempt.resetAt <= now) {
            loginAttempts.set(address, { count: 1, resetAt: now + 15 * 60 * 1000 });
          } else {
            attempt.count += 1;
          }
          sendJson(res, 401, { message: "Username atau kode akses salah." }, corsHeaders);
          return;
        }

        loginAttempts.delete(address);
        const token = randomBytes(32).toString("base64url");
        sessions.set(hashToken(token), { username, expiresAt: now + sessionLifetime });
        sendJson(res, 200, { authenticated: true, username }, {
          ...corsHeaders,
          "Set-Cookie": sessionCookie(token, sessionLifetime / 1000)
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/logout") {
        const token = getCookie(req, "clarus_session");
        if (token) sessions.delete(hashToken(token));
        sendJson(res, 200, { authenticated: false }, {
          ...corsHeaders,
          "Set-Cookie": sessionCookie("", 0)
        });
        return;
      }

      sendJson(res, 404, { message: "Endpoint tidak ditemukan." }, corsHeaders);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { message: "Metode tidak diizinkan." }, { Allow: "GET, HEAD" });
      return;
    }

    if (pathname === "/" || pathname === "/index.htm") {
      await serveFile(res, path.join(root, "index.htm"), "text/html; charset=utf-8");
      return;
    }

    if (pathname === "/api-config.js") {
      await serveFile(res, path.join(root, "api-config.js"), "text/javascript; charset=utf-8");
      return;
    }

    if (pathname.startsWith("/assets/")) {
      const assetName = pathname.slice("/assets/".length);
      if (!/^[\w.-]+$/.test(assetName)) {
        sendJson(res, 404, { message: "File tidak ditemukan." });
        return;
      }
      const extensions = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
      const contentType = extensions[path.extname(assetName).toLowerCase()];
      if (!contentType) {
        sendJson(res, 404, { message: "File tidak ditemukan." });
        return;
      }
      await serveFile(res, path.join(root, "assets", assetName), contentType);
      return;
    }

    sendJson(res, 404, { message: "Halaman tidak ditemukan." });
  } catch (error) {
    if (error.message === "Request body too large") {
      sendJson(res, 413, { message: "Data permintaan terlalu besar." });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { message: "Format data tidak valid." });
      return;
    }
    console.error(error);
    sendJson(res, 500, { message: "Terjadi kesalahan di server." });
  }
});

const start = async () => {
  await readUsers();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  app.listen(port, host, () => {
    console.log(`Clarus berjalan di http://${host}:${port}`);
  });
};

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
