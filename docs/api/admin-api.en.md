# Admin API

Management API for frontend and admin interfaces.

[中文版本](./admin-api.zh.md)

## Base URL

```
http://localhost:3000/api/webhub
```

## Authentication

When `AUTH_MODE=password`, all `/api/webhub/*` routes (except `/api/webhub/auth/*`) require a Bearer token.

```
Authorization: Bearer <token>
```

---

## Auth Endpoints (`/api/webhub/auth/*`)

These endpoints are always public.

### Get Auth Config

**GET** `/auth/config`

Returns the current authentication mode so the frontend can decide whether to show the login screen.

**Response:**

```json
{
  "success": true,
  "data": {
    "authMode": "none"
  }
}
```

`authMode` values: `"none"` | `"password"`

### Login

**POST** `/auth/login`

**Request Body:**

```json
{
  "username": "admin",
  "password": "changeme"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2027-02-07T18:00:00.000Z",
    "username": "admin"
  }
}
```

### Get Current User

**GET** `/auth/me`

Requires Bearer token.

**Response:**

```json
{
  "success": true,
  "data": {
    "username": "admin",
    "expiresAt": "2027-02-07T18:00:00.000Z"
  }
}
```

---

## Channel Management

### Create Channel

Create a new channel.

**POST** `/channels`

**Request Body:**

```json
{
  "serverName": "my-server",
  "serverUrl": "https://example.com",
  "description": "Optional description"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "channelId": "uuid",
    "channelName": "my-server",
    "registerCommand": "/webhub register uuid secret",
    "secret": "wh_secret_xxx",
    "createdAt": "2026-02-07T18:00:00.000Z"
  }
}
```

### List Channels

Get all channels.

**GET** `/channels`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Maximum results |
| `offset` | number | 0 | Pagination offset |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "my-server",
      "serverUrl": "https://example.com",
      "status": "connected",
      "createdAt": "2026-02-07T18:00:00.000Z"
    }
  ]
}
```

### Get Channel

Get channel details.

**GET** `/channels/:id`

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-server",
    "serverUrl": "https://example.com",
    "description": "Optional description",
    "status": "connected",
    "secret": "wh_secret_xxx",
    "accessToken": "wh_xxx",
    "config": {},
    "metrics": {
      "totalMessages": 10,
      "messagesToday": 5,
      "connections": 2
    },
    "createdAt": "2026-02-07T18:00:00.000Z",
    "updatedAt": "2026-02-07T18:30:00.000Z",
    "lastHeartbeat": "2026-02-07T18:30:00.000Z"
  }
}
```

### Get Channel Status

Get channel connection status.

**GET** `/channels/:id/status`

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-server",
    "status": "connected",
    "lastHeartbeat": "2026-02-07T18:30:00.000Z",
    "metrics": {
      "totalMessages": 10,
      "messagesToday": 5,
      "connections": 2
    }
  }
}
```

### Delete Channel

**DELETE** `/channels/:id`

**Response:**

```json
{
  "success": true
}
```

---

## Messages

### Send Message

Send a message to a channel.

**POST** `/channels/:id/messages`

**Request Body:**

```json
{
  "target": {
    "type": "user",
    "id": "user-uuid"
  },
  "content": {
    "text": "Hello!"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "deliveredAt": "2026-02-07T18:30:00.000Z"
  }
}
```

### Get Messages

Get message history for a channel.

**GET** `/channels/:id/messages`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Maximum results |
| `offset` | number | 0 | Pagination offset |

### Search Messages

**GET** `/channels/:id/messages/search`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `limit` | number | Maximum results |

### Edit Message

**PATCH** `/channels/:id/messages/:msgId`

**Request Body:**

```json
{
  "content": "Updated text"
}
```

### Delete Message

**DELETE** `/channels/:id/messages/:msgId`

### Stream Message

Get a streaming (SSE) view of a message being assembled in real time.

**GET** `/channels/:id/messages/:msgId/stream`

---

## Reactions

### Add Reaction

**POST** `/channels/:id/messages/:msgId/reactions/:emoji`

### Remove Reaction

**DELETE** `/channels/:id/messages/:msgId/reactions/:emoji`

---

## Read Receipts

### Mark Message as Read

**POST** `/channels/:id/messages/:msgId/read`

---

## File Upload

**POST** `/channels/:id/upload`

Content-Type: `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | File to upload (max 10 MB) |

**Response:**

```json
{
  "success": true,
  "data": {
    "url": "/uploads/uuid-filename.ext",
    "filename": "uuid-filename.ext",
    "size": 12345,
    "mimetype": "image/png"
  }
}
```

---

## Directory

### List Channel Members

**GET** `/channels/:id/directory`

---

## Sessions

### List Sessions

**GET** `/channels/:channelId/sessions`

### Reset Session

**POST** `/channels/:channelId/sessions/reset`

**Request Body:**

```json
{
  "senderId": "user-uuid"
}
```

### Switch Session

**POST** `/channels/:channelId/sessions/switch`

**Request Body:**

```json
{
  "senderId": "user-uuid",
  "targetSession": "session-id"
}
```

---

## Heartbeat

Update channel heartbeat.

**POST** `/channels/:id/heartbeat`

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "connected"
  }
}
```

---

## Active Channel

Get the currently active (plugin-connected) channel.

**GET** `/channel/active`  (also: `GET /api/webhub/channel/active`)

---

## Channel Status Values

| Status | Description |
|--------|-------------|
| `pending` | Channel created, waiting for registration |
| `registered` | Channel registered, waiting for connection |
| `connected` | Channel is connected and active |
| `disconnected` | Channel was connected but disconnected |
| `disabled` | Channel is disabled |

---

## Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `CREATE_FAILED` | Failed to create channel |
| `NOT_FOUND` | Channel not found |
| `CHANNEL_OFFLINE` | Channel is not connected |
| `INVALID_REQUEST` | Missing or invalid request parameters |
| `UNAUTHORIZED` | Authentication required or failed |
| `INTERNAL_ERROR` | Server error |

