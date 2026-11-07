# Start Multi-Node Kind Kubernetes Cluster for Judge0
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$KindBin = Join-Path $ScriptDir "bin\kind.exe"
$ClusterConfig = Join-Path $ScriptDir "cluster-config.yaml"
$ManifestsDir = Join-Path $ScriptDir "manifests"

Write-Host "=== 1. Creating Kubernetes Cluster ===" -ForegroundColor Cyan
& $KindBin create cluster --config $ClusterConfig
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✖ Failed to create cluster. Please check RAM usage." -ForegroundColor Red
    exit 1
}

Write-Host "=== 2. Loading Local Image into Cluster Nodes ===" -ForegroundColor Cyan
& $KindBin load docker-image iwillpinchu/judge0-four:v2-cgroup --name judge0-cluster

Write-Host "=== 3. Deploying Kubernetes Manifests ===" -ForegroundColor Cyan
kubectl apply -f (Join-Path $ManifestsDir "01-config.yaml")
kubectl apply -f (Join-Path $ManifestsDir "02-database-and-redis.yaml")

Write-Host "Waiting for Postgres and Redis to be ready..." -ForegroundColor Yellow
kubectl rollout status deployment/postgres -n judge0 --timeout=120s
kubectl rollout status deployment/redis -n judge0 --timeout=120s

kubectl apply -f (Join-Path $ManifestsDir "03-judge0-api.yaml")
kubectl apply -f (Join-Path $ManifestsDir "04-judge0-workers.yaml")

Write-Host "Waiting for API and Worker pods..." -ForegroundColor Yellow
kubectl rollout status deployment/judge0-api -n judge0 --timeout=120s
kubectl rollout status deployment/judge0-worker -n judge0 --timeout=180s

Write-Host "`n=== Cluster Ready! ===" -ForegroundColor Green
Write-Host "Nodes:"
kubectl get nodes -o wide
Write-Host "`nPods across nodes:"
kubectl get pods -n judge0 -o wide
Write-Host "`nAPI is accessible on: http://localhost:23580" -ForegroundColor Cyan

