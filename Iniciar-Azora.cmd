@echo off
cd /d "%~dp0"
echo Abre http://127.0.0.1:4187/ en tu navegador.
echo Para detener Azora, presiona Ctrl+C.
node server.js
pause
