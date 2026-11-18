@echo off
setlocal
set "SCRIPT_PATH=%~dp0scripts\daily-sync-and-push.ps1"

echo Registering Windows Scheduled Task: HeliosPulse_Daily_730AM_CSV_Sync (Daily at 7:30 AM)...
schtasks /Create /F /SC DAILY /ST 07:30 /TN "HeliosPulse_Daily_730AM_CSV_Sync" /TR "pwsh.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%SCRIPT_PATH%\""
if errorlevel 1 (
    echo Falling back to powershell.exe...
    schtasks /Create /F /SC DAILY /ST 07:30 /TN "HeliosPulse_Daily_730AM_CSV_Sync" /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%SCRIPT_PATH%\""
)

echo.
echo Scheduled task HeliosPulse_Daily_730AM_CSV_Sync configured for 7:30 AM daily.
exit /b 0
