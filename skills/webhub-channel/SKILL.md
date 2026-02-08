---
name: webhub-channel
description: Register this server as a WebHub channel
metadata: {"openclaw":{"requires":{"bins":["npm"]}}}
---

## About

This skill allows registering the current server as a WebHub channel for messaging.

## Setup

Register with WebHub management interface:

```bash
cd ~/.openclaw/workspace/chatu-web-hub-service
npm run register <CHANNEL_ID> <SECRET> --api-url <WEBHUB_URL>
```

Or install as OpenClaw plugin:

```bash
openclaw plugins install chatu-ai/chatu-web-hub-service
```

## Register Command

After cloning the repository:
```bash
npm install
npm run register <channelId> <secret> --api-url http://your-webhub-server:3000
```

## Environment Variables

Optional configuration:
- `WEBHUB_API_URL` - WebHub API URL (default: http://localhost:3000)
- `WEBHUB_CHANNEL_ID` - Channel ID for auto-registration
- `WEBHUB_SECRET` - Channel secret for auto-registration
