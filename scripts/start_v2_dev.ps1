param([ValidateRange(1024,65535)][int]$Port = 18766)
$ErrorActionPreference = 'Stop'
if ($Port -eq 18763) { throw '开发端口不能使用日常端口 18763。' }
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskData = Join-Path $taskRoot '.local/v2-dev/data'
$taskProjects = Join-Path $taskRoot '.local/v2-dev/projects'
New-Item -ItemType Directory -Force -Path $taskData,$taskProjects | Out-Null
$taskOldData = $env:PERSONAL_WORKBENCH_DATA_DIR
$taskOldPort = $env:PERSONAL_WORKBENCH_PORT
$taskOldScheduler = $env:PERSONAL_WORKBENCH_DISABLE_SCHEDULER
Push-Location $taskRoot
try {
    $env:PERSONAL_WORKBENCH_DATA_DIR = $taskData
    $env:PERSONAL_WORKBENCH_PORT = [string]$Port
    $env:PERSONAL_WORKBENCH_DISABLE_SCHEDULER = '1'
    Write-Host "V2 开发预览：http://127.0.0.1:$Port/"
    Write-Host "独立数据：$taskData；测试项目请放在：$taskProjects"
    & 'C:/Python314/python.exe' -B -X utf8 server.py
} finally {
    Pop-Location
    $env:PERSONAL_WORKBENCH_DATA_DIR = $taskOldData
    $env:PERSONAL_WORKBENCH_PORT = $taskOldPort
    $env:PERSONAL_WORKBENCH_DISABLE_SCHEDULER = $taskOldScheduler
}
