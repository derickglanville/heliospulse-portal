param(
    [ValidateSet("status", "run")]
    [string]$Action = "status",
    [ValidateSet("both", "sunrun", "nyseg")]
    [string]$Target = "both"
)

$ErrorActionPreference = 'SilentlyContinue'

$jobDefs = @(
    @{
        key = "sunrun"
        label = "SunRun Production Download"
        taskName = "Sunrun Daily Download and Copy"
        schedule = "Daily at 7:29 AM"
        logDir = "C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data\Script\automation_logs"
        logPattern = "sunrun_workflow_*.log"
    },
    @{
        key = "nyseg"
        label = "NYSEG Interval Usage Sync"
        taskName = "Solar Energy Tracker - NYSEG Daily Sync"
        schedule = "Daily at 7:30 AM"
        logFile = "C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data\nyseg-daily-sync.log"
    }
)

$runResults = @()
if ($Action -eq "run") {
    $selectedJobs = $jobDefs | Where-Object { $Target -eq "both" -or $_.key -eq $Target }
    foreach ($def in $selectedJobs) {
        try {
            Start-ScheduledTask -TaskName $def.taskName -ErrorAction Stop
            $runResults += [PSCustomObject]@{
                key = $def.key
                taskName = $def.taskName
                triggered = $true
                error = $null
            }
        } catch {
            $runResults += [PSCustomObject]@{
                key = $def.key
                taskName = $def.taskName
                triggered = $false
                error = $_.Exception.Message
            }
        }
    }
    Start-Sleep -Milliseconds 600
}

function Get-LatestLogSummary($def) {
    try {
        if ($def.logDir -and (Test-Path $def.logDir)) {
            $latest = Get-ChildItem -Path $def.logDir -Filter $def.logPattern -File |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if ($latest) {
                $lines = @(Get-Content $latest.FullName -Encoding UTF8 -Tail 80)
                $startIdx = 0
                for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                    if ($lines[$i] -match "Validating folders, scripts|Starting workflow") {
                        $startIdx = $i
                        break
                    }
                }
                $runLines = @($lines[$startIdx..($lines.Count - 1)] | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() })
                $reason = $runLines | Where-Object { $_ -match "Reason:|WORKFLOW FAILED:|Complete|Downloaded|Email report sent|Copied" } | Select-Object -Last 1
                if (-not $reason) { $reason = $runLines | Select-Object -Last 1 }
                return [PSCustomObject]@{
                    logFile = $latest.Name
                    updatedAt = $latest.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                    summary = "$reason".Trim()
                    recentSteps = @($runLines | Select-Object -Last 20)
                }
            }
        } elseif ($def.logFile -and (Test-Path $def.logFile)) {
            $item = Get-Item $def.logFile
            $lines = @(Get-Content $item.FullName -Encoding UTF8 -Tail 60)
            $startIdx = 0
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                if ($lines[$i] -match "^\[20\d\d-\d\d-\d\d") {
                    $startIdx = $i
                    break
                }
            }
            $runLines = @($lines[$startIdx..($lines.Count - 1)] | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() })
            $reason = $runLines | Where-Object { $_ -match "complete|ERROR|saved|updated" } | Select-Object -Last 1
            if (-not $reason) { $reason = $runLines | Select-Object -Last 1 }
            return [PSCustomObject]@{
                logFile = $item.Name
                updatedAt = $item.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                summary = "$reason".Trim()
                recentSteps = @($runLines | Select-Object -Last 20)
            }
        }
    } catch {}
    return $null
}

$jobs = @()
foreach ($def in $jobDefs) {
    $state = "Unavailable"
    $lastRunTime = $null
    $lastTaskResult = $null
    $nextRunTime = $null
    $command = ""
    $queryError = $null

    try {
        $task = Get-ScheduledTask -TaskName $def.taskName -ErrorAction Stop
        $state = "$($task.State)"
        $command = ($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)".Trim() }) -join "; "
        try {
            $info = Get-ScheduledTaskInfo -TaskName $def.taskName -ErrorAction Stop
            if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1999) {
                $lastRunTime = $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
            $lastTaskResult = [int]$info.LastTaskResult
            if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1999) {
                $nextRunTime = $info.NextRunTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
        } catch {
            $queryError = $_.Exception.Message
        }
    } catch {
        $queryError = $_.Exception.Message
    }

    $logInfo = Get-LatestLogSummary $def
    $jobs += [PSCustomObject]@{
        key = $def.key
        label = $def.label
        taskName = $def.taskName
        schedule = $def.schedule
        state = $state
        lastRunTime = $lastRunTime
        lastTaskResult = $lastTaskResult
        nextRunTime = $nextRunTime
        command = $command
        queryError = $queryError
        logInfo = $logInfo
    }
}

$payload = [PSCustomObject]@{
    checkedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    action = $Action
    target = $Target
    runResults = $runResults
    jobs = $jobs
}

$payload | ConvertTo-Json -Depth 5
