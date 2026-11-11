# Judge0 Standalone Production Deployment

This directory contains the production Docker Compose stack and configuration for the **Judge0 4-Language Edition** (C, C++20, Java 21, and Python 3.11 with NumPy).

## Quick Start

### 1. Start the Stack
```bash
docker compose up -d
```

### 2. Verify Health
Check that all containers are healthy and listening:
```bash
docker compose ps
docker compose logs -f server
```

Test API responsiveness:
```bash
curl http://localhost:2358/about
curl http://localhost:2358/languages
```

### 3. Stop the Stack
```bash
docker compose down
```

---

## Configuration (`judge0.conf`)

Key environment variables in `judge0.conf`:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `COUNT` | `24` | Number of parallel Resque worker processes |
| `MAX_TEST_CASES_PER_SUITE` | `200` | Maximum test cases accepted in a single `/suites` request |
| `MAX_QUEUE_SIZE` | `200` | Max queued jobs allowed before returning HTTP 503 |
| `POSTGRES_PASSWORD` | `WN8BP4...` | Database authentication secret |
| `REDIS_PASSWORD` | `WN8BP4...` | Redis cache and queue authentication secret |
| `RAILS_LOG_LEVEL` | `warn` | Log verbosity (keeps logs concise and prevents disk bloat) |
| `JUDGE0_TELEMETRY_ENABLE` | `false` | Disables telemetry callbacks |

---

## Architecture

- **`server`**: Puma HTTP API server listening on `0.0.0.0:2358`.
- **`worker`**: Resque job processor running `scripts/workers` with cgroup v2 sandbox isolation.
- **`db`**: PostgreSQL 16.2 database storing submission and suite records.
- **`redis`**: Redis 7.2.4 queue storing async background jobs.

