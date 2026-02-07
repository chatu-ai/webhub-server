---
title: Channels API Reference
title_zh: 通道 API 参考
language: en
languages:
  - { id: en, name: English, link: ./channels.md }
  - { id: zh, name: 中文, link: ./channels.zh.md }
---

# Channels API Reference API endpoints for channel

REST management in WebHub.

## Base URL

```
http://localhost:3000
```

## Authentication

All channel management endpoints require no authentication by default. For production, configure authentication via environment variables or middleware.

## Endpoints

### Create Channel

Create a new channel for integration.

**Endpoint:** `POST /api/webhub/channels`

**Request Body:**

```json
{
  "name": "my-channel",
  "serverUrl": "https://example.com",
  "description": "My channel description"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "channelId": "wh_abc123...",
    "channelName": "my-channel",
    "registerCommand": "/webhub register wh_abc123 secret_xxx",
    "secret": "wh_secret_xxx",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Channels

Get all registered channels.

**Endpoint:** `GET /api/webhub/channels`

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
      "id": "wh_abc123...",
      "name": "my-channel",
      "serverUrl": "https://example.com",
      "status": "connected",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Channel

Get details of a specific channel.

**Endpoint:** `GET /api/webhub/channels/:id`

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123...",
    "name": "my-channel",
    "serverUrl": "https://example.com",
    "status": "connected",
    "secret": "wh_secret_xxx",
    "accessToken": "wh_xxx",
    "metrics": {
      "totalMessages": 100,
      "messagesToday": 10,
      "connections": 1
    },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Channel Status

Get real-time status of a channel.

**Endpoint:** `GET /api/webhub/channels/:id/status`

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123...",
    "name": "my-channel",
    "status": "connected",
    "lastHeartbeat": "2024-01-01T00:05:00.000Z",
    "metrics": {
      "totalMessages": 100,
      "messagesToday": 10,
      "connections": 1
    }
  }
}
```

### Delete Channel

Remove a channel and its data.

**Endpoint:** `DELETE /api/webhub/channels/:id`

**Response:**

```json
{
  "success": true
}
```

## Channel Status Values

| Status | Description |
|--------|-------------|
| `pending` | Channel created, awaiting registration |
| `registered` | Channel secret verified |
| `connected` | Channel actively connected |
| `disconnected` | Channel connection lost |

---

# 通道 API 参考

WebHub 中用于通道管理的 REST API 端点。

## 基础 URL

```
http://localhost:3000
```

## 身份验证

默认情况下，所有通道管理端点无需身份验证。生产环境可通过环境变量或中间件配置身份验证。

## 端点

### 创建通道

创建新的集成通道。

**端点：** `POST /api/webhub/channels`

**请求体：**

```json
{
  "name": "my-channel",
  "serverUrl": "https://example.com",
  "description": "我的通道描述"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "channelId": "wh_abc123...",
    "channelName": "my-channel",
    "registerCommand": "/webhub register wh_abc123 secret_xxx",
    "secret": "wh_secret_xxx",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 列出通道

获取所有已注册的通道。

**端点：** `GET /api/webhub/channels`

**查询参数：**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `limit` | number | 100 | 最大结果数 |
| `offset` | number | 0 | 分页偏移 |

**响应：**

```json
{
  "success": true,
  "data": [
    {
      "id": "wh_abc123...",
      "name": "my-channel",
      "serverUrl": "https://example.com",
      "status": "connected",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 获取通道

获取特定通道的详细信息。

**端点：** `GET /api/webhub/channels/:id`

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123...",
    "name": "my-channel",
    "serverUrl": "https://example.com",
    "status": "connected",
    "secret": "wh_secret_xxx",
    "accessToken": "wh_xxx",
    "metrics": {
      "totalMessages": 100,
      "messagesToday": 10,
      "connections": 1
    },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 获取通道状态

获取通道的实时状态。

**端点：** `GET /api/webhub/channels/:id/status`

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123...",
    "name": "my-channel",
    "status": "connected",
    "lastHeartbeat": "2024-01-01T00:05:00.000Z",
    "metrics": {
      "totalMessages": 100,
      "messagesToday": 10,
      "connections": 1
    }
  }
}
```

### 删除通道

移除通道及其数据。

**端点：** `DELETE /api/webhub/channels/:id`

**响应：**

```json
{
  "success": true
}
```

## 通道状态值

| 状态 | 描述 |
|------|------|
| `pending` | 通道已创建，等待注册 |
| `registered` | 通道密钥已验证 |
| `connected` | 通道主动连接 |
| `disconnected` | 通道连接丢失 |
