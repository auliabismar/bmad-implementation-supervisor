# Install script for Windows

Write-Host "Installing BMAD Implementation Supervisor..." -ForegroundColor Cyan

$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    Write-Host "Error: Bun is not installed. Install from https://bun.sh" -ForegroundColor Red
    exit 1
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
bun install

Write-Host "Running TypeScript type check..." -ForegroundColor Yellow
bun run typecheck

Write-Host "Installation complete!" -ForegroundColor Green