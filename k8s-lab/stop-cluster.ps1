# Delete the Kind Kubernetes Cluster and clean up all resources
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$KindBin = Join-Path $ScriptDir "bin\kind.exe"

Write-Host "Deleting judge0-cluster..." -ForegroundColor Yellow
& $KindBin delete cluster --name judge0-cluster

Write-Host "Cluster deleted. All virtual nodes and pods removed." -ForegroundColor Green

