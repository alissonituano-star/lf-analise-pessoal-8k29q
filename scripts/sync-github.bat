@echo off
setlocal
cd /d "%~dp0.."

if not exist "logs" mkdir "logs"

echo [%date% %time%] Iniciando sincronizacao Lotofacil... >> "logs\sync.log"
npm run sync >> "logs\sync.log" 2>&1
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% EQU 0 (
  echo [%date% %time%] Sincronizacao concluida com sucesso. >> "logs\sync.log"
) else (
  echo [%date% %time%] Sincronizacao falhou com codigo %EXIT_CODE%. >> "logs\sync.log"
)

exit /b %EXIT_CODE%
