# Channel API

API for WebHub Channel SDK integration.

## Base URL

```
http://localhost:3000/api/channel
```

## Overview

These endpoints are used by the WebHub Channel SDK running on the channel server side.

## Endpoints

### Register Channel

Register a channel with the hub.

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

**Error Response:**

```json
{
  "success": false,
  "error": "Invalid credentials",
  "code": "UNAUTHORIZED"
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
  "channelId": "uuid"
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

### Forward Message

Forward a message to OpenClaw.

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
  "target": {
    "type": "user",
    "id": "user-uuid"
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

### Webhook

Receive messages from OpenClaw.

**POST** `/webhook`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Channel-ID` | Channel identifier |

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

**Response:**

```json
{
  "success": true
}
```

## SDK Integration Flow

```
1. Channel Server starts
   ↓
2. POST /register { channelId, secret }
   ↓
3. Receive accessToken
   ↓
4. POST /connect (with accessToken)
   ↓
5. Status: connected
   ↓
6. Send/Receive messages via WebSocket or POST /messages
   ↓
7. POST /disconnect (when shutting down)
```

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

## Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid credentials or token |
| `INVALID_REQUEST` | Missing required fields |
| `INTERNAL_ERROR` | Server error |
