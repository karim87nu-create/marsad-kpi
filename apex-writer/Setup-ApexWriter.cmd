@echo off
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Setup-ApexWriter.ps1"
if errorlevel 1 pause
