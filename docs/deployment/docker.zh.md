# Docker 部署

使用 Docker 或 Docker Compose 部署 WebHub 后端服务。

## 单容器部署

```bash
# 创建数据目录
mkdir -p ./data

# 运行后端容器
docker run -d \
  --name webhub-backend \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

## Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
```

启动服务：

```bash
# 创建数据目录
mkdir -p ./data

# 启动
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 环境模式 | `production` |
| `PORT` | 服务端口 | `3000` |
| `DB_PATH` | SQLite 数据库路径 | `./data/webhub.db` |

## 数据持久化

**默认位置：** `/app/data/webhub.db`

挂载卷以保留数据：

```bash
docker run -v $(pwd)/data:/app/data ...
```

如果数据库不存在，会自动创建。

## 健康检查

容器在 `/health` 包含健康检查：

```bash
# 手动健康检查
curl http://localhost:3000/health
# 返回: {"status":"ok","timestamp":"..."}
```

## 前端+后端一体化部署

如需前端和后端一起部署，请参考 [chatu-web-hub-front](https://github.com/chatu-ai/chatu-web-hub-front)。
