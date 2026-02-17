# WebHub Backend Service

A standalone web service that provides REST API and WebSocket support for website messaging channels.

## Documentation

See the [docs](./docs/) directory for detailed documentation:

### Deployment
- [Docker Deployment](./docs/deployment/docker.en.md)
- [Kubernetes Deployment](./docs/deployment/kubernetes.en.md)

### API Reference
- [Admin API](./docs/api/admin-api.en.md) - Frontend/management interfaces (`/api/webhub/*`)
- [Channel API](./docs/api/channel-api.en.md) - WebHub Channel SDK (`/api/channel/*`)

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
- **Authentication**: Secret-based channel authentication
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

## API Endpoints

### Admin API (`/api/webhub/*`)

For frontend and management interfaces:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhub/channels` | Create channel |
| GET | `/api/webhub/channels` | List all channels |
| GET | `/api/webhub/channels/:id` | Get channel details |
| GET | `/api/webhub/channels/:id/status` | Get channel status |
| DELETE | `/api/webhub/channels/:id` | Delete channel |
| POST | `/api/webhub/channels/:id/messages` | Send message |
| GET | `/api/webhub/channels/:id/messages` | Get messages |
| POST | `/api/webhub/channels/:id/heartbeat` | Update heartbeat |

### Channel API (`/api/channel/*`)

For WebHub Channel SDK integration:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/channel/register` | Register channel |
| POST | `/api/channel/connect` | Connect channel |
| POST | `/api/channel/disconnect` | Disconnect channel |
| POST | `/api/channel/messages` | Forward message |
| POST | `/api/channel/webhook` | Receive webhook |

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
# Trigger CI
