# WebHub Documentation

WebHub is a standalone web service that bridges websites with OpenClaw for real-time messaging.

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

- **Channel Management**: Create, list, and delete channels
- **Message Routing**: HTTP API and WebSocket support
- **SQLite Persistence**: Channels and messages stored in SQLite
- **TypeScript**: Full type safety

## Documentation Structure

### Deployment
- [Docker](./deployment/docker.en.md)
- [Kubernetes](./deployment/kubernetes.en.md)

### API Reference
- [Admin API](./api/admin-api.en.md) - For frontend/management interfaces (`/api/webhub/*`)
- [Channel API](./api/channel-api.en.md) - For WebHub Channel SDK (`/api/channel/*`)
- [Message Format Documentation (EN)](./MESSAGE_FORMAT.en.md)
- [Message Format Documentation (中文)](./MESSAGE_FORMAT.zh.md)

[中文文档](./README.zh.md)

## Quick Start

See [Deployment Guide](./deployment/docker.en.md) for detailed setup instructions.

## Related Projects

| Project | Description |
|---------|-------------|
| [openclaw-web-hub-channel](https://github.com/chatu-ai/openclaw-web-hub-channel) | Channel SDK |
| [chatu-web-hub-front](https://github.com/chatu-ai/chatu-web-hub-front) | Reference frontend UI |
