# WebHub Backend Service

A standalone web service that provides REST API and WebSocket support for website messaging channels.

## Documentation

See the [docs](./docs/) directory for detailed documentation:

### Deployment
- [Docker Deployment (EN)](./docs/deployment/docker.en.md)
- [Docker Deployment (中文)](./docs/deployment/docker.zh.md)
- [Kubernetes Deployment (EN)](./docs/deployment/kubernetes.en.md)
- [Kubernetes Deployment (中文)](./docs/deployment/kubernetes.zh.md)
- [Docker Environment Variables](./DOCKER_ENV.md)

### API Reference
- [Admin API (EN)](./docs/api/admin-api.en.md) — Frontend/management interfaces (`/api/webhub/*`)
- [Admin API (中文)](./docs/api/admin-api.zh.md)
- [Channel API (EN)](./docs/api/channel-api.en.md) — WebHub Channel SDK (`/api/channel/*`)
- [Channel API (中文)](./docs/api/channel-api.zh.md)
- [Message Format (EN)](./docs/MESSAGE_FORMAT.en.md)
- [消息格式 (中文)](./docs/MESSAGE_FORMAT.zh.md)

[中文文档](./docs/README.zh.md)

## What is WebHub Service?

WebHub Service is a **backend server** that:
- Provides REST API endpoints for channel management
- Supports WebSocket connections for real-time messaging
- Manages channel authentication and message routing
- Stores channel data and messages in SQLite database

## Architecture

```
┌─────────────┐     REST/WebSocket      ┌─────────────┐
│  Frontend   │ ────────────────────→  │   WebHub    │
│    Web      │                         │   Service   │
│     UI      │ ←───────────────────   │  (Backend)  │
└─────────────┘                         └──────┬──────┘
                                               │
                                               │ SQLite
                                               ▼
                                        ┌─────────────┐
                                        │  Database   │
                                        │  (Channels, │
                                        │  Messages)  │
                                        └─────────────┘
```

## Features

- **Channel Management**: Create, list, query, delete channels via REST API
- **Message Routing**: HTTP API and WebSocket support for real-time messaging
- **SQLite Persistence**: Channels and messages stored in SQLite database
- **Authentication**: Optional password-based authentication with JWT
- **File Upload**: Per-channel file upload support (max 10 MB)
- **TypeScript**: Full type safety

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Test
npm test
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3000` | Server port |
| `DB_PATH` | `./data/webhub.db` | SQLite database file path |
| `UPLOAD_DIR` | `./data/uploads` | Uploaded files directory |
| `AUTH_MODE` | `none` | Authentication mode: `none` or `password` |
| `JWT_SECRET` | — | JWT signing secret (change in production!) |

Copy `.env.example` to `.env` and adjust as needed.

## Docker

```bash
# Backend only
docker build -t webhub:latest .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data webhub:latest

# All-in-one (frontend + backend + nginx)
docker build -f Dockerfile.allinone -t webhub:allinone .
docker run -d -p 80:80 -v $(pwd)/data:/app/data webhub:allinone
```

## Health Check

```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}
```

## Related Projects

| Project | Description |
|---------|-------------|
| [openclaw-web-hub-channel](https://github.com/chatu-ai/openclaw-web-hub-channel) | Channel SDK (this service uses it) |
| [chatu-web-hub-front](https://github.com/chatu-ai/chatu-web-hub-front) | Reference frontend UI |

## License

MIT

