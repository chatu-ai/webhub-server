# WebHub Backend Service

Reference backend implementation for WebHub - a standalone web service that bridges websites with OpenClaw.

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
- **Real-time Updates**: WebSocket heartbeat and auto-reconnect
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

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/channels` | List all channels |
| POST | `/api/channels/apply` | Apply for a new channel |
| GET | `/api/channels/:id` | Get channel details |
| DELETE | `/api/channels/:id` | Delete a channel |
| GET | `/api/channels/:id/messages` | Get message history |
| POST | `/api/channels/:id/messages` | Send a message |

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
