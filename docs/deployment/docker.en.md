---
title: Docker Deployment
title_zh: Docker 部署
language: en
languages:
  - { id: en, name: English, link: ./docker.en.md }
  - { id: zh, name: 中文, link: ./docker.zh.md }
---

# Docker Deployment

This guide covers deploying WebHub using Docker, including backend-only, all-in-one, and Docker Compose setups.

[中文版本](./docker.zh.md)

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+ (for compose deployments)

---

## Option 1: Backend Only

Run the backend service alone. The frontend can be served separately or via a CDN.

### Build and Run

```bash
# Build the image
docker build -t webhub:latest .

# Run the container
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  webhub:latest
```

### Using the Published Image

```bash
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### Verify Deployment

```bash
# Check container status
docker ps | grep webhub

# Check health endpoint
curl http://localhost:3000/health
```

---

## Option 2: All-in-One (Frontend + Backend)

The `Dockerfile.allinone` bundles the backend and the pre-built frontend into a single container behind Nginx.

```bash
# Build the all-in-one image
docker build -f Dockerfile.allinone -t webhub:allinone .

# Run the container
docker run -d \
  --name webhub-allinone \
  -p 80:80 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  webhub:allinone
```

Access the application at `http://localhost`.

---

## Option 3: Docker Compose (Recommended)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service

# Create data directory
mkdir -p ./data

# Start services
docker compose up -d
```

### Docker Compose File

```yaml
services:
  webhub:
    image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
    container_name: webhub
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - HTTP_PORT=3000
      - DB_PATH=/app/data/webhub.db
      - AUTH_MODE=none
      - JWT_SECRET=your-secret-key-change-in-production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
```

---

## Volume Mounting

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./data` | `/app/data` | SQLite database + uploads |

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `production` | No | Node environment |
| `HTTP_PORT` | `3000` | No | Backend server port |
| `DB_PATH` | `./data/webhub.db` | No | SQLite database file path |
| `UPLOAD_DIR` | `./data/uploads` | No | Uploaded files directory |
| `AUTH_MODE` | `none` | No | `none` or `password` |
| `AUTH_USERNAME` | `admin` | No | Admin username (password mode) |
| `AUTH_PASSWORD` | `changeme` | No | Admin password (password mode) |
| `JWT_SECRET` | — | No | JWT signing secret (**change in production!**) |
| `TOKEN_EXPIRE_HOURS` | `8760` | No | Token lifetime in hours |

---

## Health Checks

```bash
# Manual health check
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

---

## Management Commands

```bash
# View logs
docker compose logs -f

# Restart service
docker compose restart

# Stop service
docker compose down

# Stop and remove volumes
docker compose down -v
```

## Updating

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d
```

