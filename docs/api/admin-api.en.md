# Admin API

Management API for frontend and admin interfaces.

## Base URL

```
http://localhost:3000/api/webhub
```

## Endpoints

### Create Channel

Create a new channel.

**POST** `/channels`

**Request Body:**

```json
{
  "name": "my-server",
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

Delete a channel.

**DELETE** `/channels/:id`

**Response:**

```json
{
  "success": true
}
```

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

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "channelId": "uuid",
      "direction": "inbound",
      "messageType": "text",
      "content": "Hello!",
      "senderId": "user-uuid",
      "senderName": "User Name",
      "status": "delivered",
      "createdAt": "2026-02-07T18:30:00.000Z"
    }
  ]
}
```

### Heartbeat

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

## Channel Status Values

| Status | Description |
|--------|-------------|
| `pending` | Channel created, waiting for registration |
| `registered` | Channel registered, waiting for connection |
| `connected` | Channel is connected and active |
| `disconnected` | Channel was connected but disconnected |
| `disabled` | Channel is disabled |

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
| `INTERNAL_ERROR` | Server error |
