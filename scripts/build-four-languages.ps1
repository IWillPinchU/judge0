Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Building Lightweight 4-Language Compilers Image..." -ForegroundColor Cyan
Write-Host " C (GCC 12), C++ (G++ 12), Java (OpenJDK 21), Python (3.11) [Debian 12]" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

docker build -t judge0-compilers-four:latest -f compilers/Dockerfile.four-languages compilers/
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Judge0 4-Languages Stack (Server, Worker, DB, Redis)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

docker compose -f judge0/docker-compose.four-languages.yml up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Judge0 is running on http://localhost:2358" -ForegroundColor Green
Write-Host " Languages available: C (ID 50), C++ (ID 54), Java (ID 62), Python (ID 71)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

