# Docker Environment Variables

## Backend Service (chatu-web-hub-service)

### Runtime Variables
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | No |
| `PORT` | Server port | `3000` | No |
| `DB_PATH` | SQLite database path | `./data/webhub.db` | No |
| `WEBHUB_JWT_SECRET` | JWT signing secret | - | No (optional) |
| `WEBHUB_ADMIN_TOKEN` | Admin API token | - | No (optional) |

### Data Persistence

The backend uses **SQLite** for data persistence. Mount a volume to preserve data across container restarts.

**Default data location:** `/app/data/webhub.db`

```bash
# Create data directory
mkdir -p ./data

# Run with volume mount
docker run -d \
  --name webhub-backend \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

### Example Run Command

```bash
docker run -d \
  --name webhub-backend \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  ghcr.io/chatu-ai/chatu-web-hub-service:latest
```

**Note:** Database is automatically created at `/app/data/webhub.db` if it doesn't exist.

---

## Frontend (chatu-web-hub-front)

### Build-time Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `/api/webhub` |
| `NODE_ENV` | Environment mode | `production` |

### Runtime (No persistence needed)

```bash
docker run -d \
  --name webhub-frontend \
  -p 8080:80 \
  ghcr.io/chatu-ai/chatu-web-hub-front:latest
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
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
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
# Optional: Custom database path
# DB_PATH=/app/data/webhub.db
```

Run:

```bash
# Create data directory first
mkdir -p ./data

# Start services
docker compose up -d
```

### Directory Structure

```
webhub/
├── docker-compose.yml
├── .env
└── data/
    └── webhub.db    # SQLite database (auto-created)
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
docker pull ghcr.io/chatu-web-hub-front:latest
```

### Image Tags
- `latest` - Latest main branch
- `sha-{commit}` - Specific commit
