@echo off
title Blog Editor
cd /d D:\blog
echo Starting essay editor at http://localhost:4999 ...
echo (Keep this window open while writing. Close it to stop the editor.)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:4999"
node editor.mjs
