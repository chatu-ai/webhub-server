# Docker Environment Variables

## Backend Service (chatu-web-hub-service)

### Build-time Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |

### Runtime Variables (can be set via `-e` flag)
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | No |
| `PORT` | Server port | `3000` | No |
| `WEBHUB_JWT_SECRET` | JWT signing secret | - | Yes |
| `WEBHUB_ADMIN_TOKEN` | Admin API token | - | Yes |
| `CHANNEL_ID` | Channel ID | - | Yes |

### Example Run Command

```bash
docker run -d \
  --name webhub-backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e WEBHUB_JWT_SECRET=your-secret \
  -e WEBHUB_ADMIN_TOKEN=your-token \
  -e CHANNEL_ID=your-channel \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

---

## Frontend (chatu-web-hub-front)

### Build-time Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `/api/webhub` |
| `NODE_ENV` | Environment mode | `production` |

### Runtime Variables (configured in nginx.conf)
The frontend uses environment variables at **build time**. To change the API URL:

**Option 1: Rebuild with new URL**
```bash
docker build \
  --build-arg VITE_API_URL=https://your-backend.com \
  -t your-frontend:latest .
```

**Option 2: Use with external backend**
The nginx config proxies `/api/webhub` to `webhub-backend:3000`. When running:

```bash
docker run -d \
  --name webhub-frontend \
  -p 8080:80 \
  --link webhub-backend:webhub-backend \
  ghcr.io/chatu-ai/chatu-web-hub-front:latest
```

Or with external URL:
```bash
# Edit nginx.conf to change proxy_pass URL
```

---

## Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - WEBHUB_JWT_SECRET=${WEBHUB_JWT_SECRET}
      - WEBHUB_ADMIN_TOKEN=${WEBHUB_ADMIN_TOKEN}
      - CHANNEL_ID=${CHANNEL_ID}
    restart: unless-stopped

  frontend:
    image: ghcr.io/chatu-ai/chatu-web-hub-front:latest
    ports:
      - "8080:80"
    depends_on:
      - backend
    restart: unless-stopped

networks:
  default:
    name: webhub-network
```

Create `.env` file:

```env
WEBHUB_JWT_SECRET=your-super-secret-key
WEBHUB_ADMIN_TOKEN=your-admin-token
CHANNEL_ID=your-channel-id
```

Run:

```bash
docker compose up -d
```

---

## GitHub Container Registry

### Pull Images

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Pull backend
docker pull ghcr.io/chatu-ai/chatu-web-hub-service:latest

# Pull frontend
docker pull ghcr.io/chatu-ai/chatu-web-hub-front:latest
```

### Image Tags
- `latest` - Latest main branch
- `sha-{commit}` - Specific commit
- `v1.0.0` - Version tags
