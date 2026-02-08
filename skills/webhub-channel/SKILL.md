---
name: webhub-channel
description: Register this server as a WebHub channel for OpenClaw
metadata: {"openclaw":{"requires":{"bins":["git","npm"]}}}
---

## About

This skill allows registering the current server as a WebHub channel for messaging with OpenClaw.

## Installation

Install via OpenClaw plugin system:

```bash
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service
openclaw plugins install .
```

## Channel Registration

After applying for a channel on the WebHub management interface, add it to OpenClaw:

```bash
openclaw channels add --channel chatu-webhub --token "<CHANNEL_ID>:<SECRET>" --api-url <WEBHUB_URL>
```

## Setup Commands

```bash
# Clone and install
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service
npm install

# Run register command (if not using openclaw channels add)
npm run register <channelId> <secret> --api-url <webhubUrl>
```

## Environment Variables

Optional configuration:
- `WEBHUB_API_URL` - WebHub API URL (default: http://localhost:3000)
- `WEBHUB_CHANNEL_ID` - Channel ID for auto-registration
- `WEBHUB_SECRET` - Channel secret for auto-registration
