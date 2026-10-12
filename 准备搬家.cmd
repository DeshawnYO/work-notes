@echo off
setlocal
set "APP_DIR=%~dp0"
set "PACKAGE_DIR=%APP_DIR%"
if not exist "%PACKAGE_DIR%runtime\python.exe" for /d %%D in ("%APP_DIR%dist\*") do if exist "%%~fD\runtime\python.exe" set "PACKAGE_DIR=%%~fD\"
if not exist "%PACKAGE_DIR%runtime\python.exe" (
  echo Portable folder missing. Build it first.
  pause
  exit /b 1
)
"%PACKAGE_DIR%runtime\python.exe" -s -E -B "%PACKAGE_DIR%prepare_move.py"
pause
