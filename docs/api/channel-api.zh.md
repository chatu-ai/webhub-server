# 频道 API

用于 WebHub Channel SDK 集成的接口。

## 基础 URL

```
http://localhost:3000/api/channel
```

## 概述

这些端点由运行在频道服务器端的 WebHub Channel SDK 使用。

## 端点

### 注册频道

向 hub 注册频道。

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

**错误响应：**

```json
{
  "success": false,
  "error": "Invalid credentials",
  "code": "UNAUTHORIZED"
}
```

### 连接频道

建立与 hub 的连接。

**POST** `/connect`

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
    "status": "connected"
  }
}
```

### 断开连接

断开与 hub 的连接。

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

### 转发消息

向 OpenClaw 转发消息。

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
  "target": {
    "type": "user",
    "id": "user-uuid"
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

### Webhook

接收来自 OpenClaw 的消息。

**POST** `/webhook`

**请求头：**

| 请求头 | 描述 |
|--------|------|
| `X-Channel-ID` | 频道标识符 |

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

**响应：**

```json
{
  "success": true
}
```

## SDK 集成流程

```
1. 频道服务器启动
   ↓
2. POST /register { channelId, secret }
   ↓
3. 接收 accessToken
   ↓
4. POST /connect (携带 accessToken)
   ↓
5. 状态: connected
   ↓
6. 通过 WebSocket 或 POST /messages 发送/接收消息
   ↓
7. POST /disconnect (关闭时)
```

## WebSocket 连接

频道也可以通过 WebSocket 连接进行实时消息传递：

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

## 错误码

| 错误码 | 描述 |
|--------|------|
| `UNAUTHORIZED` | 凭据或令牌无效 |
| `INVALID_REQUEST` | 缺少必需字段 |
| `INTERNAL_ERROR` | 服务器错误 |
