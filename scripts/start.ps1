# Start script for Windows

$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    Write-Host "Error: Bun is not installed. Install from https://bun.sh" -ForegroundColor Red
    exit 1
}

Write-Host "Starting BMAD Implementation Supervisor..." -ForegroundColor Cyan
bun run src/index.ts