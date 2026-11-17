import { randomBytes, randomInt, scrypt as scryptCallback } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const root = path.dirname(fileURLToPath(import.meta.url));
const privateDir = path.join(root, "private");
const usersFile = path.join(privateDir, "users.json");
const credentialsFile = path.join(privateDir, "account-codes.txt");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const createCode = () => Array.from(
  { length: 16 },
  () => alphabet[randomInt(alphabet.length)]
).join("");

await mkdir(privateDir, { recursive: true });

for (const file of [usersFile, credentialsFile]) {
  try {
    await readFile(file);
    console.error(`File ${path.relative(root, file)} sudah ada. Akun tidak diubah; pindahkan file tersebut terlebih dahulu jika ingin membuat ulang akun.`);
    process.exit(1);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const users = [];
const credentials = ["Akun login Clarus X-1", "Simpan file ini secara pribadi dan bagikan kode hanya kepada pemilik akun.", ""];

for (let index = 1; index <= 37; index += 1) {
  const username = `clarus${String(index).padStart(2, "0")}`;
  const code = createCode();
  const salt = randomBytes(16);
  const passwordHash = await scrypt(code, salt, 64);
  users.push({
    username,
    salt: salt.toString("base64"),
    passwordHash: passwordHash.toString("base64")
  });
  credentials.push(`${username}\t${code}`);
}

const usersHandle = await open(usersFile, "wx", 0o600);
try {
  await usersHandle.writeFile(`${JSON.stringify(users, null, 2)}\n`, "utf8");
} finally {
  await usersHandle.close();
}

try {
  const credentialsHandle = await open(credentialsFile, "wx", 0o600);
  try {
    await credentialsHandle.writeFile(`${credentials.join("\n")}\n`, "utf8");
  } finally {
    await credentialsHandle.close();
  }
} catch (error) {
  console.error("Kode akun tidak berhasil disimpan. Hapus private/users.json sebelum mencoba kembali.");
  throw error;
}

console.log("37 akun berhasil dibuat.");
console.log(`Username dan kode tersimpan di ${path.relative(root, credentialsFile)} (jangan unggah atau bagikan file ini secara publik).`);
