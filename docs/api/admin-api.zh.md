# 管理 API

用于前端和管理界面的管理接口。

[English Version](./admin-api.en.md)

## 基础 URL

```
http://localhost:3000/api/webhub
```

## 认证

当 `AUTH_MODE=password` 时，所有 `/api/webhub/*` 路由（`/api/webhub/auth/*` 除外）均需要 Bearer 令牌。

```
Authorization: Bearer <token>
```

---

## 认证端点（`/api/webhub/auth/*`）

以下端点始终公开，无需认证。

### 获取认证配置

**GET** `/auth/config`

返回当前认证模式，前端据此决定是否显示登录界面。

**响应：**

```json
{
  "success": true,
  "data": {
    "authMode": "none"
  }
}
```

`authMode` 可选值：`"none"` | `"password"`

### 登录

**POST** `/auth/login`

**请求体：**

```json
{
  "username": "admin",
  "password": "changeme"
}
```

**响应：**

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

### 获取当前用户信息

**GET** `/auth/me`

需要 Bearer 令牌。

**响应：**

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

## 频道管理

### 创建频道

**POST** `/channels`

**请求体：**

```json
{
  "serverName": "my-server",
  "serverUrl": "https://example.com",
  "description": "可选描述"
}
```

**响应：**

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

### 列出频道

**GET** `/channels`

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
      "id": "uuid",
      "name": "my-server",
      "serverUrl": "https://example.com",
      "status": "connected",
      "createdAt": "2026-02-07T18:00:00.000Z"
    }
  ]
}
```

### 获取频道详情

**GET** `/channels/:id`

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-server",
    "serverUrl": "https://example.com",
    "description": "可选描述",
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

### 获取频道状态

**GET** `/channels/:id/status`

**响应：**

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

### 删除频道

**DELETE** `/channels/:id`

**响应：**

```json
{
  "success": true
}
```

---

## 消息

### 发送消息

**POST** `/channels/:id/messages`

**请求体：**

```json
{
  "target": {
    "type": "user",
    "id": "user-uuid"
  },
  "content": {
    "text": "你好！"
  }
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "deliveredAt": "2026-02-07T18:30:00.000Z"
  }
}
```

### 获取消息历史

**GET** `/channels/:id/messages`

**查询参数：**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `limit` | number | 100 | 最大结果数 |
| `offset` | number | 0 | 分页偏移 |

### 搜索消息

**GET** `/channels/:id/messages/search`

**查询参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `q` | string | 搜索关键词 |
| `limit` | number | 最大结果数 |

### 编辑消息

**PATCH** `/channels/:id/messages/:msgId`

**请求体：**

```json
{
  "content": "修改后的文本"
}
```

### 删除消息

**DELETE** `/channels/:id/messages/:msgId`

### 消息流式查看

获取正在实时组装的消息的 SSE 流。

**GET** `/channels/:id/messages/:msgId/stream`

---

## 表情反应

### 添加反应

**POST** `/channels/:id/messages/:msgId/reactions/:emoji`

### 删除反应

**DELETE** `/channels/:id/messages/:msgId/reactions/:emoji`

---

## 已读回执

### 标记消息为已读

**POST** `/channels/:id/messages/:msgId/read`

---

## 文件上传

**POST** `/channels/:id/upload`

Content-Type: `multipart/form-data`

| 字段 | 类型 | 描述 |
|------|------|------|
| `file` | file | 要上传的文件（最大 10 MB） |

**响应：**

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

## 通讯录

### 列出频道成员

**GET** `/channels/:id/directory`

---

## 会话管理

### 列出会话

**GET** `/channels/:channelId/sessions`

### 重置会话

**POST** `/channels/:channelId/sessions/reset`

**请求体：**

```json
{
  "senderId": "user-uuid"
}
```

### 切换会话

**POST** `/channels/:channelId/sessions/switch`

**请求体：**

```json
{
  "senderId": "user-uuid",
  "targetSession": "session-id"
}
```

---

## 心跳

更新频道心跳。

**POST** `/channels/:id/heartbeat`

**响应：**

```json
{
  "success": true,
  "data": {
    "status": "connected"
  }
}
```

---

## 活跃频道

获取当前活跃（插件已连接）的频道。

**GET** `/channel/active`（也可用：`GET /api/webhub/channel/active`）

---

## 频道状态值

| 状态 | 描述 |
|------|------|
| `pending` | 已创建，等待注册 |
| `registered` | 已注册，等待连接 |
| `connected` | 已连接并活跃 |
| `disconnected` | 曾连接但已断开 |
| `disabled` | 已禁用 |

---

## 错误响应

```json
{
  "success": false,
  "error": "错误信息",
  "code": "错误码"
}
```

### 错误码

| 错误码 | 描述 |
|--------|------|
| `CREATE_FAILED` | 创建频道失败 |
| `NOT_FOUND` | 频道不存在 |
| `CHANNEL_OFFLINE` | 频道未连接 |
| `INVALID_REQUEST` | 请求参数缺失或无效 |
| `UNAUTHORIZED` | 需要认证或认证失败 |
| `INTERNAL_ERROR` | 服务器错误 |

