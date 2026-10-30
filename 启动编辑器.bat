@echo off
title Blog Admin
cd /d D:\blog
echo Starting blog admin at http://localhost:4999 ...
echo (Keep this window open while editing. Close it to stop.)
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:4999"
node editor.mjs
