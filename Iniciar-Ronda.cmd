@echo off
cd /d "%~dp0"
echo Abre http://localhost:4187/ en tu navegador.
echo Para detener Azora, presiona Ctrl+C.
node server.js
pause
