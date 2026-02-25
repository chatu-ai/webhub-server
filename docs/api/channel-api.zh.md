# 频道 API

用于 WebHub Channel SDK 集成的接口。

[English Version](./channel-api.en.md)

## 基础 URL

```
http://localhost:3000/api/channel
```

## 概述

这些端点由运行在频道服务器端的 WebHub Channel SDK 使用。

---

## 频道生命周期

### 注册频道

使用 `channelId` + `secret` 向 Hub 注册频道。

**POST** `/register`

**请求体：**

```json
{
  "channelId": "uuid",
  "secret": "wh_secret_xxx"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "channelId": "uuid",
    "accessToken": "wh_xxx"
  }
}
```

### 快速注册

使用频道 key 和服务器 URL 快速注册（如频道不存在则自动创建）。

**POST** `/quick-register`

**请求体：**

```json
{
  "key": "my-channel-key",
  "serverUrl": "https://example.com"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "channelId": "uuid",
    "accessToken": "wh_xxx"
  }
}
```

### 连接频道

建立与 Hub 的连接。

**POST** `/connect`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

**请求体：**

```json
{
  "channelId": "uuid",
  "pluginVersion": "1.0.0"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "status": "connected"
  }
}
```

### 断开连接

断开与 Hub 的连接。

**POST** `/disconnect`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

**请求体：**

```json
{
  "channelId": "uuid"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "status": "disconnected"
  }
}
```

### 验证频道

验证频道凭据。

**POST** `/verify`

**请求体：**

```json
{
  "channelId": "uuid",
  "accessToken": "wh_xxx"
}
```

---

## 消息

### 转发消息

将消息从频道转发到前端（通过 Hub）。

**POST** `/messages`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Channel-Token` | 频道认证令牌 |

**请求体：**

```json
{
  "channelId": "uuid",
  "messageId": "uuid",
  "sender": {
    "id": "user-uuid",
    "name": "用户名"
  },
  "content": {
    "text": "来自频道的消息！"
  }
}
```

**响应：**

```json
{
  "success": true,
  "messageId": "uuid",
  "deliveredAt": "2026-02-07T18:30:00.000Z"
}
```

### 获取待发消息

获取排队等待发送给插件的消息（离线队列）。

**GET** `/messages/pending`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

### 确认消息

将消息标记为已接收/已处理。

**POST** `/messages/:id/ack`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

---

## 流式传输

### 发送流式响应块

发送部分（流式）响应内容块。

**POST** `/stream/chunk`

**请求体：**

```json
{
  "channelId": "uuid",
  "messageId": "uuid",
  "chunk": "部分文本..."
}
```

### 流式响应完成信号

通知流式响应已全部完成。

**POST** `/stream/done`

**请求体：**

```json
{
  "channelId": "uuid",
  "messageId": "uuid"
}
```

---

## 输入状态指示

**POST** `/typing`（也可用：`POST /api/webhub/channel/typing`）

**请求体：**

```json
{
  "channelId": "uuid",
  "senderId": "user-uuid",
  "isTyping": true
}
```

---

## 命令

命令由前端（如会话重置、会话切换）发出，排队等待插件异步处理。

### 获取待处理命令

**GET** `/commands`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

### 确认命令

**POST** `/commands/:commandId/ack`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Access-Token` | 频道访问令牌 |

---

## Webhook

接收特定频道的 Webhook 事件。

**POST** `/api/webhooks/:channelId`

**请求体：**

```json
{
  "event": "message",
  "data": {
    "id": "msg-uuid",
    "sender": {
      "id": "user-uuid",
      "name": "用户名"
    },
    "content": {
      "text": "你好！"
    }
  }
}
```

---

## 状态与版本

### 获取频道状态

**GET** `/status`

从数据库返回频道的真实连接状态。

**请求头：**

| 头部 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `X-Channel-ID` | string | 否 | 要查询的频道 ID |

**响应：**

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

### 获取活跃频道

**GET** `/active`

返回当前插件连接的频道。

### 获取服务版本

**GET** `/version`

**响应：**

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

`pluginVersion` 在插件通过 `POST /connect` 携带 `pluginVersion` 字段连接后填充，否则为 `null`。

---

## 跨频道消息中继

将消息从其他频道来源（TUI、WhatsApp、Telegram）中继到 ChatU 前端。

**POST** `/cross-channel-messages`

---

## SDK 集成流程

```
1. 频道服务器启动
   ↓
2. POST /register { channelId, secret }
   ↓
3. 接收 accessToken
   ↓
4. POST /connect { channelId }（携带 X-Access-Token 请求头）
   ↓
5. 状态: connected
   ↓
6. 通过 POST /messages 转发消息
   通过 POST /stream/chunk + /stream/done 发送流式响应
   ↓
7. POST /disconnect（关闭时）
```

---

## WebSocket 连接

频道也可以通过 WebSocket 进行实时消息传递：

```typescript
const ws = new WebSocket('ws://localhost:3000/ws', {
  headers: {
    'X-Channel-ID': 'uuid',
    'X-Access-Token': 'wh_xxx'
  }
});

// 每 30 秒发送心跳
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);

// 处理消息
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('收到:', message);
};
```

---

## SSE（服务器推送事件）

前端可通过 SSE 端点接收实时事件，无需 WebSocket：

```
GET /api/webhub/channels/:id/sse
```

---

## 错误码

| 错误码 | 描述 |
|--------|------|
| `UNAUTHORIZED` | 凭据或令牌无效 |
| `INVALID_REQUEST` | 缺少必需字段 |
| `NOT_FOUND` | 资源不存在 |
| `INTERNAL_ERROR` | 服务器错误 |

