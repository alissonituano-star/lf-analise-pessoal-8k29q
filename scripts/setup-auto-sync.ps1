$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$taskName = "Lotofacil - Atualizar Supabase e GitHub"
$batchPath = Join-Path $projectRoot "scripts\sync-github.bat"
$logDir = Join-Path $projectRoot "logs"
$keyPath = Join-Path $projectRoot "supabase-service-role.key"

if (-not (Test-Path $batchPath)) {
  throw "Arquivo nao encontrado: $batchPath"
}

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

if (-not (Test-Path $keyPath)) {
  Write-Host "Aviso: supabase-service-role.key ainda nao existe." -ForegroundColor Yellow
  Write-Host "O agendamento sera criado, mas o Supabase sera ignorado ate voce criar esse arquivo." -ForegroundColor Yellow
}

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$batchPath`"" `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At 23:40
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Atualiza resultados da Lotofacil, envia para Supabase e publica no GitHub." `
  -Force | Out-Null

Write-Host "Agendamento criado: $taskName" -ForegroundColor Green
Write-Host "Horario: todos os dias as 23:40" -ForegroundColor Green
Write-Host "Logs: $logDir\sync.log" -ForegroundColor Green
