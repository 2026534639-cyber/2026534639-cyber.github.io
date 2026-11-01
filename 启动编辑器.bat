@echo off
title Blog Admin
chcp 65001 >nul
cd /d D:\blog

if not exist "node_modules" (
  echo Dependencies missing. Run:  npx pnpm@11.5.3 install
  pause
  exit /b 1
)

echo Starting blog admin: http://127.0.0.1:4999
echo First start takes 10-20s. Keep this window open; close it to stop.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:4999"
node editor.mjs

if errorlevel 1 pause
