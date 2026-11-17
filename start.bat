@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Install Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)

if not exist "private\users.json" (
  echo Membuat akun Clarus...
  call node create-accounts.mjs
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" http://127.0.0.1:3000
node server.mjs
