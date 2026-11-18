$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "daily-sync.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Add-Content -Path $logFile -Value "[$timestamp] Starting scheduled 7:30 AM CSV telemetry sync..."

try {
    $env:NOTIFY_EMAIL = "1"
    node scripts/sync-csv-data.mjs | Out-String | Add-Content -Path $logFile

    $status = git status --porcelain src/data/telemetryData.json
    if ($status) {
        git add src/data/telemetryData.json
        $dateStr = Get-Date -Format "yyyy-MM-dd"
        git commit -m "Automated 7:30 AM daily CSV telemetry sync ($dateStr)" | Out-String | Add-Content -Path $logFile
        git push origin main | Out-String | Add-Content -Path $logFile
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Pushed updated telemetryData.json to origin/main (GitHub Pages deploy triggered)."
    } else {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] No CSV changes detected."
    }
} catch {
    $errMsg = $_.Exception.Message
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $errMsg"
    try {
        $errJson = @{
            title = "Scheduled 7:30 AM CSV Sync Failed"
            message = $errMsg
            source = "scripts/daily-sync-and-push.ps1"
        } | ConvertTo-Json -Compress
        $errJson | python scripts/notify_email.py --report-app-error - | Out-String | Add-Content -Path $logFile
    } catch {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Email alert fallback failed: $($_.Exception.Message)"
    }
    exit 1
}
