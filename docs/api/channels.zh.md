# 频道 API 参考

用于管理频道的 REST API 端点。

## 基础 URL

```
http://localhost:3000/api/webhub
```

## 端点

### 创建频道

创建新频道。

**POST** `/channels`

**请求体：**

```json
{
  "name": "my-server",
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

获取所有频道。

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

**响应：** 包含完整频道信息

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

### 获取消息历史

**GET** `/channels/:id/messages`

### 心跳

**POST** `/channels/:id/heartbeat`

## 频道状态值

| 状态 | 描述 |
|------|------|
| `pending` | 已创建，等待注册 |
| `registered` | 已注册，等待连接 |
| `connected` | 已连接并活跃 |
| `disconnected` | 曾连接但已断开 |
| `disabled` | 已禁用 |

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
| `INTERNAL_ERROR` | 服务器错误 |
