# Channel API

API for WebHub Channel SDK integration.

[中文版本](./channel-api.zh.md)

## Base URL

```
http://localhost:3000/api/channel
```

## Overview

These endpoints are used by the WebHub Channel SDK running on the channel server side.

---

## Channel Lifecycle

### Register Channel

Register a channel with the hub using `channelId` + `secret`.

**POST** `/register`

**Request Body:**

```json
{
  "channelId": "uuid",
  "secret": "wh_secret_xxx"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "channelId": "uuid",
    "accessToken": "wh_xxx"
  }
}
```

### Quick Register

Simplified registration using channel key and server URL (creates channel if it doesn't exist).

**POST** `/quick-register`

**Request Body:**

```json
{
  "key": "my-channel-key",
  "serverUrl": "https://example.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "channelId": "uuid",
    "accessToken": "wh_xxx"
  }
}
```

### Connect Channel

Establish connection to the hub.

**POST** `/connect`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

**Request Body:**

```json
{
  "channelId": "uuid",
  "pluginVersion": "1.0.0"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "connected"
  }
}
```

### Disconnect Channel

Disconnect from the hub.

**POST** `/disconnect`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

**Request Body:**

```json
{
  "channelId": "uuid"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "disconnected"
  }
}
```

### Verify Channel

Verify channel credentials.

**POST** `/verify`

**Request Body:**

```json
{
  "channelId": "uuid",
  "accessToken": "wh_xxx"
}
```

---

## Messages

### Forward Message

Forward a message from the channel to the frontend (via the hub).

**POST** `/messages`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Channel-Token` | Channel authentication token |

**Request Body:**

```json
{
  "channelId": "uuid",
  "messageId": "uuid",
  "sender": {
    "id": "user-uuid",
    "name": "User Name"
  },
  "content": {
    "text": "Hello from channel!"
  }
}
```

**Response:**

```json
{
  "success": true,
  "messageId": "uuid",
  "deliveredAt": "2026-02-07T18:30:00.000Z"
}
```

### Get Pending Messages

Get messages queued for delivery to the plugin (offline queue).

**GET** `/messages/pending`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

### Acknowledge Message

Mark a message as received/processed.

**POST** `/messages/:id/ack`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

---

## Streaming

### Send Stream Chunk

Send a partial (streaming) response chunk.

**POST** `/stream/chunk`

**Request Body:**

```json
{
  "channelId": "uuid",
  "messageId": "uuid",
  "chunk": "partial text..."
}
```

### Signal Stream Done

Signal that a streaming response has completed.

**POST** `/stream/done`

**Request Body:**

```json
{
  "channelId": "uuid",
  "messageId": "uuid"
}
```

---

## Typing Indicator

**POST** `/typing`  (also: `POST /api/webhub/channel/typing`)

**Request Body:**

```json
{
  "channelId": "uuid",
  "senderId": "user-uuid",
  "isTyping": true
}
```

---

## Commands

Commands are issued by the frontend (e.g., session reset, session switch) and queued for the plugin to process asynchronously.

### Get Pending Commands

**GET** `/commands`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

### Acknowledge Command

**POST** `/commands/:commandId/ack`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Access-Token` | Channel access token |

---

## Webhooks

Receive a webhook event for a specific channel.

**POST** `/api/webhooks/:channelId`

**Request Body:**

```json
{
  "event": "message",
  "data": {
    "id": "msg-uuid",
    "sender": {
      "id": "user-uuid",
      "name": "User Name"
    },
    "content": {
      "text": "Hello!"
    }
  }
}
```

---

## Status & Version

### Get Channel Status

**GET** `/status`

Returns the real connection status of the channel from the database.

**Request Headers:**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Channel-ID` | string | No | Channel ID to look up |

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "connected",
    "channelId": "uuid",
    "lastHeartbeat": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Active Channel

**GET** `/active`

Returns the channel currently connected by the plugin.

### Get Service Version

**GET** `/version`

**Response:**

```json
{
  "success": true,
  "data": {
    "serviceVersion": "1.0.0",
    "buildTime": null,
    "nodeVersion": "20.11.0",
    "pluginVersion": "0.1.0"
  }
}
```

`pluginVersion` is populated after a plugin calls `POST /connect` with a `pluginVersion` field.

---

## Cross-Channel Relay

Relay a message from another channel source (TUI, WhatsApp, Telegram) to the ChatU frontend.

**POST** `/cross-channel-messages`

---

## SDK Integration Flow

```
1. Channel server starts
   ↓
2. POST /register { channelId, secret }
   ↓
3. Receive accessToken
   ↓
4. POST /connect { channelId } (with X-Access-Token header)
   ↓
5. Status: connected
   ↓
6. Forward messages via POST /messages
   Stream chunks via POST /stream/chunk + /stream/done
   ↓
7. POST /disconnect (when shutting down)
```

---

## WebSocket Connection

Channels can also connect via WebSocket for real-time messaging:

```typescript
const ws = new WebSocket('ws://localhost:3000/ws', {
  headers: {
    'X-Channel-ID': 'uuid',
    'X-Access-Token': 'wh_xxx'
  }
});

// Send heartbeat every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);

// Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

---

## SSE (Server-Sent Events)

The hub exposes an SSE endpoint so the frontend can receive real-time events without WebSocket:

```
GET /api/webhub/channels/:id/sse
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid credentials or token |
| `INVALID_REQUEST` | Missing required fields |
| `NOT_FOUND` | Resource not found |
| `INTERNAL_ERROR` | Server error |

