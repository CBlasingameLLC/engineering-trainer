@echo off
cd /d "%~dp0"

REM The portable build runs on Node. A missing runtime is the likely failure on
REM a fresh Windows machine, and "'node' is not recognized" in a window that
REM closes immediately is not a usable error message.
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Engineering Trainer - portable build
  echo   ------------------------------------
  echo.
  echo   Node.js was not found on this machine, and the portable build needs it.
  echo.
  echo   Two options:
  echo.
  echo     1. Install Node.js from https://nodejs.org  ^(the LTS build^), then
  echo        run this file again.
  echo.
  echo     2. Use the native Windows installer instead, which needs nothing
  echo        else installed. Look for engineering-trainer_x.y.z_x64-setup.exe
  echo        or the .msi.
  echo.
  pause
  exit /b 1
)

node serve.mjs
pause
