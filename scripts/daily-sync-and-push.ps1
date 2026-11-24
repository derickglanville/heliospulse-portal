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
    # Pull remote commits first so scheduled push to origin/main never rejects due to non-fast-forward
    git pull --rebase --autostash origin main | Out-String | Add-Content -Path $logFile

    $env:NOTIFY_EMAIL = "1"
    node scripts/sync-csv-data.mjs | Out-String | Add-Content -Path $logFile

    $expectedGeneratedAt = ""
    if (Test-Path "src/data/telemetryData.json") {
        try {
            $localMeta = (Get-Content "src/data/telemetryData.json" -Raw | ConvertFrom-Json).metadata
            $expectedGeneratedAt = "$($localMeta.generated_at)"
        } catch {}
    }

    $status = git status --porcelain src/data/telemetryData.json public/telemetryData.json
    $pushedThisRun = $false
    if ($status) {
        git add src/data/telemetryData.json public/telemetryData.json
        $dateStr = Get-Date -Format "yyyy-MM-dd"
        git commit -m "Automated 7:30 AM daily CSV telemetry sync ($dateStr)" | Out-String | Add-Content -Path $logFile
        git push origin main | Out-String | Add-Content -Path $logFile
        $pushedThisRun = $true
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Pushed updated telemetryData.json to origin/main (GitHub Pages deploy triggered)."
    } else {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] No CSV changes detected."
    }

    # Verify GitHub Pages actually published today's snapshot (auto-retry once if deploy-pages@v4 failed transiently)
    $pagesUrl = "https://derickglanville.github.io/heliospulse-portal/telemetryData.json"
    $todayIsoPrefix = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
    $verifiedLive = $false
    $waitInitial = if ($pushedThisRun) { 75 } else { 5 }
    Start-Sleep -Seconds $waitInitial

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            $resp = Invoke-RestMethod -Uri "${pagesUrl}?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 20
            $liveGen = "$($resp.metadata.generated_at)"
            if ($expectedGeneratedAt -and $liveGen -eq $expectedGeneratedAt) {
                $verifiedLive = $true
                break
            }
            if (-not $pushedThisRun -and $liveGen.StartsWith($todayIsoPrefix)) {
                $verifiedLive = $true
                break
            }
        } catch {}
        if ($attempt -lt 5) { Start-Sleep -Seconds 30 }
    }

    if (-not $verifiedLive) {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WARNING: Live GitHub Pages snapshot still stale after push (expected $expectedGeneratedAt). Triggering one deploy retry..."
        $dateStr = Get-Date -Format "yyyy-MM-dd"
        git commit --allow-empty -m "Retry 7:30 AM GitHub Pages mobile deploy ($dateStr)" | Out-String | Add-Content -Path $logFile
        git push origin main | Out-String | Add-Content -Path $logFile
        Start-Sleep -Seconds 90
        for ($retryCheck = 1; $retryCheck -le 4; $retryCheck++) {
            try {
                $resp2 = Invoke-RestMethod -Uri "${pagesUrl}?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 20
                if ("$($resp2.metadata.generated_at)" -eq $expectedGeneratedAt -or "$($resp2.metadata.generated_at)".StartsWith($todayIsoPrefix)) {
                    $verifiedLive = $true
                    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] GitHub Pages retry deploy verified live ($($resp2.metadata.generated_at))."
                    break
                }
            } catch {}
            if ($retryCheck -lt 4) { Start-Sleep -Seconds 30 }
        }
        if (-not $verifiedLive) {
            throw "GitHub Pages live snapshot ($pagesUrl) did not reflect $expectedGeneratedAt after retry."
        }
    } else {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Verified live GitHub Pages mobile snapshot is up to date ($expectedGeneratedAt)."
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
