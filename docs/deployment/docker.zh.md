# Docker 部署

使用 Docker 或 Docker Compose 部署 WebHub 后端服务。

[English Version](./docker.en.md)

---

## 方式一：仅后端

仅运行后端服务，前端可单独部署或通过 CDN 提供。

### 构建并运行

```bash
# 构建镜像
docker build -t webhub:latest .

# 运行容器
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  webhub:latest
```

### 使用已发布镜像

```bash
docker run -d \
  --name webhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### 验证部署

```bash
# 检查容器状态
docker ps | grep webhub

# 检查健康端点
curl http://localhost:3000/health
```

---

## 方式二：前后端一体化

`Dockerfile.allinone` 将后端与预构建的前端打包到单个容器中，由 Nginx 提供服务。

```bash
# 构建一体化镜像
docker build -f Dockerfile.allinone -t webhub:allinone .

# 运行容器
docker run -d \
  --name webhub-allinone \
  -p 80:80 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  webhub:allinone
```

在浏览器访问 `http://localhost` 即可使用。

---

## 方式三：Docker Compose（推荐）

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service

# 创建数据目录
mkdir -p ./data

# 启动服务
docker compose up -d
```

### Docker Compose 文件

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

### 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 停止并删除数据卷
docker compose down -v
```

---

## 卷挂载

| 宿主机路径 | 容器路径 | 用途 |
|-----------|---------|------|
| `./data` | `/app/data` | SQLite 数据库 + 上传文件 |

---

## 环境变量

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `NODE_ENV` | `production` | 否 | Node 运行环境 |
| `HTTP_PORT` | `3000` | 否 | 后端服务端口 |
| `DB_PATH` | `./data/webhub.db` | 否 | SQLite 数据库文件路径 |
| `UPLOAD_DIR` | `./data/uploads` | 否 | 上传文件存储目录 |
| `AUTH_MODE` | `none` | 否 | `none`（开放）或 `password` |
| `AUTH_USERNAME` | `admin` | 否 | 管理员用户名（password 模式） |
| `AUTH_PASSWORD` | `changeme` | 否 | 管理员密码（password 模式） |
| `JWT_SECRET` | — | 否 | JWT 签名密钥（**生产环境必须修改！**） |
| `TOKEN_EXPIRE_HOURS` | `8760` | 否 | 令牌有效时长（小时） |

---

## 健康检查

```bash
# 手动健康检查
curl http://localhost:3000/health
# 返回: {"status":"ok","timestamp":"..."}
```

---

## 更新服务

```bash
# 拉取最新镜像
docker compose pull

# 重启服务
docker compose up -d
```

