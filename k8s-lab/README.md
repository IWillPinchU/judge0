# Judge0 Multi-Node Kubernetes Simulation Lab (`k8s-lab`)

This folder contains a self-contained, lightweight multi-node Kubernetes lab using [`kind`](https://kind.sigs.k8s.io/) (Kubernetes in Docker). It simulates a production multi-machine deployment without the heavy RAM overhead of multiple VMware virtual machines.

## Architecture

```
[ Your Host PC ] ─────────────► http://localhost:23580 (NodePort 32358)
                                           │
  ┌────────────────────────────────────────┼────────────────────────────────────────┐
  │                                        ▼                                        │
  │   [ control-plane node ]      [ worker-1 node ]           [ worker-2 node ]     │
  │   - judge0-api Pod            - judge0-worker Pod 1       - judge0-worker Pod 2 │
  │   - postgres Pod                (Runs Isolate Cgroup v2)    (Runs Isolate)      │
  │   - redis Pod                                                                   │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Launch the Cluster
Open PowerShell and run:
```powershell
cd D:\Projecto\Judge0\judge0\k8s-lab
.\start-cluster.ps1
```
This script will:
1. Spin up a 3-node cluster (`control-plane`, `worker-1`, `worker-2`).
2. Sideload your local `iwillpinchu/judge0-four:v2-cgroup` image into the nodes (no re-downloading).
3. Deploy PostgreSQL, Redis, Judge0 API, and 2 Judge0 Worker pods spread across both worker nodes.
4. Expose the API on `http://localhost:23580`.

### 2. Inspect the Cluster
```powershell
# See nodes
kubectl get nodes -o wide

# See pods and what node each pod is running on
kubectl get pods -n judge0 -o wide

# Follow worker logs
kubectl logs -f -l app=judge0-worker -n judge0 --max-log-requests=10
```

### 3. Run the Test
```powershell
node test-cluster.js
```
You will see submissions distributed and executed concurrently across the different worker nodes.

### 4. Delete the Cluster & Free Resources
When you are done playing with the lab, run:
```powershell
.\stop-cluster.ps1
```
This completely deletes the cluster and frees all RAM/CPU instantly.

