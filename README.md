# WebHub Backend Service

Reference backend implementation for WebHub - a standalone web service that bridges websites with OpenClaw.

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

WebHub Service is a **reference implementation** of a backend that:
- Provides REST API endpoints for channel management
- Supports WebSocket connections for real-time messaging
- Demonstrates how to integrate with OpenClaw Channel SDK

## Architecture

```
┌─────────────┐     REST/WebSocket      ┌─────────────┐
│  Frontend   │ ←────────────────────→ │  Backend    │
│  (Manager)  │                        │  Service    │
└─────────────┘                        └──────┬──────┘
                                               │
                                               │ Channel SDK
                                               ▼
                                        ┌─────────────┐
                                        │  OpenClaw   │
                                        │  Gateway    │
                                        └─────────────┘
```

## Features

- **Channel Management**: Apply, list, delete channels
- **Message Routing**: HTTP API and WebSocket support
- **SQLite Persistence**: Channels and messages stored in SQLite
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
