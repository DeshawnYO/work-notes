@echo off
setlocal
set "APP_DIR=%~dp0"
set "PYTHONW=%APP_DIR%runtime\pythonw.exe"
set "PYFLAGS=-s -E -B"
if not exist "%PYTHONW%" (
  set "PYTHONW=C:\Python314\pythonw.exe"
  set "PYFLAGS=-B"
)
if not exist "%PYTHONW%" (
  echo Python runtime missing. Use the complete portable folder.
  pause
  exit /b 1
)
start "" "%PYTHONW%" %PYFLAGS% "%APP_DIR%launcher.py"
