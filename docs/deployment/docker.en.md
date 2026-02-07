---
title: Docker Deployment
title_zh: Docker 部署
language: en
languages:
  - { id: en, name: English, link: ./docker.md }
  - { id: zh, name: 中文, link: ./docker.zh.md }
---

# Docker Deployment

This guide covers deploying WebHub using Docker, including single-container and Docker Compose setups.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+ (for compose deployments)

## Single Container Deployment

### Build and Run

```bash
# Build the image
docker build -t webhub:latest .

# Run the container
docker run -d \
  --name webhub \
  -p 80:80 \
  -p 3000:3000 \
  -v webhub-data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  webhub:latest
```

### Verify Deployment

```bash
# Check container status
docker ps | grep webhub

# Check health endpoint
curl http://localhost/health
```

## Docker Compose (Recommended)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service

# Start services
docker-compose up -d
```

### Docker Compose File

```yaml
version: '3.8'

services:
  webhub:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: webhub
    ports:
      - "80:80"
      - "3000:3000"
    volumes:
      - webhub-data:/app/data
      - webhub-logs:/app/logs
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/webhub.db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3

volumes:
  webhub-data:
  webhub-logs:
```

## Volume Mounting

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `webhub-data` | `/app/data` | SQLite database persistence |
| `webhub-logs` | `/app/logs` | Application logs |

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `production` | No | Node environment |
| `PORT` | `3000` | No | Backend server port |
| `DB_PATH` | `./data/webhub.db` | No | Database file path |

## Health Checks

The container includes a built-in health check:

```bash
# Manual health check
docker exec webhub node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## Management Commands

```bash
# View logs
docker-compose logs -f webhub

# Restart service
docker-compose restart webhub

# Stop service
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d
```

---

# Docker 部署

本指南介绍如何使用 Docker 部署 WebHub，包括单容器和 Docker Compose 设置。

## 前置条件

- Docker 20.10+
- Docker Compose 2.0+（用于 compose 部署）

## 单容器部署

### 构建和运行

```bash
# 构建镜像
docker build -t webhub:latest .

# 运行容器
docker run -d \
  --name webhub \
  -p 80:80 \
  -p 3000:3000 \
  -v webhub-data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  webhub:latest
```

### 验证部署

```bash
# 检查容器状态
docker ps | grep webhub

# 检查健康端点
curl http://localhost/health
```

## Docker Compose（推荐）

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service

# 启动服务
docker-compose up -d
```

### Docker Compose 文件

```yaml
version: '3.8'

services:
  webhub:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: webhub
    ports:
      - "80:80"
      - "3000:3000"
    volumes:
      - webhub-data:/app/data
      - webhub-logs:/app/logs
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/webhub.db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3

volumes:
  webhub-data:
  webhub-logs:
```

## 卷挂载

| 主机路径 | 容器路径 | 用途 |
|----------|----------|------|
| `webhub-data` | `/app/data` | SQLite 数据库持久化 |
| `webhub-logs` | `/app/logs` | 应用程序日志 |

## 环境变量

| 变量 | 默认值 | 必需 | 描述 |
|------|--------|------|------|
| `NODE_ENV` | `production` | 否 | Node 环境 |
| `PORT` | `3000` | 否 | 后端服务器端口 |
| `DB_PATH` | `./data/webhub.db` | 否 | 数据库文件路径 |

## 健康检查

容器包含内置健康检查：

```bash
# 手动健康检查
docker exec webhub node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

预期响应：
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## 管理命令

```bash
# 查看日志
docker-compose logs -f webhub

# 重启服务
docker-compose restart webhub

# 停止服务
docker-compose down

# 停止并删除卷
docker-compose down -v
```

## 更新

```bash
# 拉取最新更改
git pull

# 重新构建并重启
docker-compose build --no-cache
docker-compose up -d
```
