# WebHub Backend Service

Reference backend implementation for WebHub - a standalone web service that bridges websites with OpenClaw.

## Documentation

For detailed deployment and API documentation, see the [docs](./docs/) directory:

- [Deployment - Docker](./docs/deployment/docker.md)
- [Deployment - Kubernetes](./docs/deployment/kubernetes.md)
- [API Reference - Channels](./docs/api/channels.md)

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

All API endpoints are prefixed with `/api/webhub`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhub/channels` | Create channel |
| GET | `/api/webhub/channels` | List all channels |
| GET | `/api/webhub/channels/:id` | Get channel details |
| GET | `/api/webhub/channels/:id/status` | Get channel status |
| DELETE | `/api/webhub/channels/:id` | Delete channel |
| POST | `/api/webhub/channels/:id/messages` | Send message |
| GET | `/api/webhub/channels/:id/messages` | Get messages |
| GET | `/health` | Health check |

## WebSocket

Connect to `/ws` for real-time messaging:

```typescript
const ws = new WebSocket('ws://localhost:3000/ws');

// Heartbeat (every 30s)
ws.send(JSON.stringify({ type: 'ping' }));
```

## Related Projects

| Project | Description |
|---------|-------------|
| [openclaw-web-hub-channel](https://github.com/chatu-ai/openclaw-web-hub-channel) | Channel SDK (this service uses it) |
| [chatu-web-hub-front](https://github.com/chatu-ai/chatu-web-hub-front) | Reference frontend UI |

## License

MIT
