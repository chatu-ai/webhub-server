# Docker Environment Variables / Docker 环境变量

## English

### Runtime Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLE_FRONTEND` | `true` starts Nginx and serves the frontend UI; `false` backend-only | `false` | No |
| `NODE_ENV` | Node environment | `production` | No |
| `HTTP_PORT` | Backend server port | `3000` | No |
| `DB_PATH` | Full path to the SQLite database file | `./data/webhub.db` | No |
| `UPLOAD_DIR` | Directory for uploaded files | `./data/uploads` | No |
| `AUTH_MODE` | Authentication mode: `none` (open access) or `password` | `none` | No |
| `AUTH_USERNAME` | Admin username (password mode only) | `admin` | No |
| `AUTH_PASSWORD` | Admin password (password mode only) | `changeme` | No |
| `JWT_SECRET` | JWT signing secret — **change in production!** | random string | No |
| `TOKEN_EXPIRE_HOURS` | JWT token lifetime in hours | `8760` (1 year) | No |

### Data Persistence

The backend uses **SQLite** for persistence. Mount a volume to preserve data across restarts.

Default database location: `/app/data/webhub.db`

```bash
# Create data directory
mkdir -p ./data

# Run with volume mount
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### Example: Full Configuration

```bash
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e HTTP_PORT=3000 \
  -e DB_PATH=/app/data/webhub.db \
  -e AUTH_MODE=password \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=your-secure-password \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))") \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### Docker Compose (Recommended)

```yaml
services:
  webhub:
    image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
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

### All-in-One (Frontend + Backend)

Set `ENABLE_FRONTEND=true` to start Nginx and serve the bundled frontend UI.

```bash
docker run -d \
  --name webhub-allinone \
  -p 80:80 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e HTTP_PORT=3000 \
  -e DB_PATH=/app/data/webhub.db \
  -e ENABLE_FRONTEND=true \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

---

## 中文

### 运行时环境变量

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `ENABLE_FRONTEND` | `true` 启动 Nginx 并提供前端 UI；`false` 仅后端 | `false` | 否 |
| `NODE_ENV` | Node 运行环境 | `production` | 否 |
| `HTTP_PORT` | 后端服务端口 | `3000` | 否 |
| `DB_PATH` | SQLite 数据库文件完整路径 | `./data/webhub.db` | 否 |
| `UPLOAD_DIR` | 上传文件存储目录 | `./data/uploads` | 否 |
| `AUTH_MODE` | 认证模式：`none`（开放访问）或 `password` | `none` | 否 |
| `AUTH_USERNAME` | 管理员用户名（仅 password 模式） | `admin` | 否 |
| `AUTH_PASSWORD` | 管理员密码（仅 password 模式） | `changeme` | 否 |
| `JWT_SECRET` | JWT 签名密钥 — **生产环境必须更改！** | 随机字符串 | 否 |
| `TOKEN_EXPIRE_HOURS` | JWT 令牌有效时长（小时） | `8760`（1年） | 否 |

### 数据持久化

后端使用 **SQLite** 进行数据持久化，挂载卷以防止数据丢失。

默认数据库位置：`/app/data/webhub.db`

```bash
# 创建数据目录
mkdir -p ./data

# 挂载卷运行
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### 示例：完整配置

```bash
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e HTTP_PORT=3000 \
  -e DB_PATH=/app/data/webhub.db \
  -e AUTH_MODE=password \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=your-secure-password \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))") \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### Docker Compose（推荐）

```yaml
services:
  webhub:
    image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
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

### 一体化（前端 + 后端）

设置 `ENABLE_FRONTEND=true` 可启动 Nginx 并提供捆绑的前端 UI。

```bash
docker run -d \
  --name webhub-allinone \
  -p 80:80 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e HTTP_PORT=3000 \
  -e DB_PATH=/app/data/webhub.db \
  -e ENABLE_FRONTEND=true \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

