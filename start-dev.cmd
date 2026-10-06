@echo off
setlocal
cd /d "%~dp0"
set "MOGU_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined MOGU_NODE set "MOGU_NODE=%%N"
if not defined MOGU_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "MOGU_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined MOGU_NODE (
  echo Node.js was not found. Install Node.js LTS, then reopen your terminal.
  exit /b 1
)
for %%N in ("%MOGU_NODE%") do set "PATH=%%~dpN;%PATH%"
if not exist "node_modules\vinext\dist\cli.js" (
  echo Dependencies are missing. Install project dependencies first.
  exit /b 1
)
"%MOGU_NODE%" scripts\run-framework.mjs dev
exit /b %errorlevel%
