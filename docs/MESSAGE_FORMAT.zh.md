# 消息格式文档

WebHub Channel Service 消息格式完整说明。

## 目录

- [概述](#概述)
- [核心消息类型](#核心消息类型)
  - [入站消息 (InboundMessage)](#入站消息-inboundmessage)
  - [出站消息 (OutboundMessage)](#出站消息-outboundmessage)
- [消息字段详解](#消息字段详解)
  - [发送者 (Sender)](#发送者-sender)
  - [目标 (Target)](#目标-target)
  - [消息内容 (Content)](#消息内容-content)
  - [媒体附件 (Media)](#媒体附件-media)
  - [消息回复 (ReplyTo)](#消息回复-replyto)
- [消息类型说明](#消息类型说明)
- [API 端点](#api-端点)
- [完整示例](#完整示例)

---

## 概述

WebHub Channel Service 支持两种主要的消息流向：

| 流向 | 类型 | 说明 | 端点 |
|------|------|------|------|
| **入站** | `InboundMessage` | 从频道接收的消息 | `POST /api/channel/messages` |
| **出站** | `OutboundMessage` | 发送到 OpenClaw 的消息 | `POST /api/channel/messages` |

---

## 核心消息类型

### 入站消息 (InboundMessage)

从外部频道（如 OpenClaw）接收的消息格式。

#### TypeScript 类型定义

```typescript
interface InboundMessage {
  /** 消息唯一标识符 */
  id: string;
  
  /** 频道 ID */
  channelId: string;
  
  /** 消息时间戳（Unix 毫秒） */
  timestamp: number;
  
  /** 发送者信息 */
  sender: {
    id: string;
    name?: string;
    avatar?: string;
  };
  
  /** 消息内容 */
  content: {
    text: string;
    format?: 'plain' | 'markdown' | 'html';
  };
  
  /** 媒体附件（可选） */
  media?: Media[];
  
  /** 回复引用（可选） */
  replyTo?: {
    /** 回复的目标消息 ID */
    id: string;
    /** 引用文本（可选） */
    quoteText?: string;
  };
} |
| `channelId` | `string` | ✅ | 频道的唯一标识符 |
| `timestamp` | `number` | ✅ | 消息发送时间（Unix 时间戳，毫秒） |
| `sender` | `object` | ✅ | 消息发送者的信息 |
| `sender.id` | `string` | ✅ | 发送者的唯一标识符 |
| `sender.name` | `string` | ❌ | 发送者的显示名称 |
| `sender.avatar` | `string` | ❌ | 发送者的头像 URL |
| `content` | `object` | ✅ | 消息的内容信息 |
| `content.text` | `string` | ✅ | 消息的文本内容 |
| `content.format` | `string` | ❌ | 文本格式：`plain`（纯文本）、`markdown`（Markdown）、`html`（HTML），默认为 `plain` |
| `media` | `array` | ❌ | 媒体附件数组，参见 [媒体附件](#媒体附件-media) |
| `replyTo` | `object` | ❌ | 回复引用对象：`{ id: string; quoteText?: string }` |

---

### 出站消息 (OutboundMessage)

发送到 OpenClaw 的消息格式。

#### TypeScript 类型定义

```typescript
interface OutboundMessage {
  /** 消息唯一标识符（可选，系统会自动生成） */
  messageId?: string;
  
  /** 频道 ID */
  channelId: string;
  
  /** 消息目标 */
  target: {
    type: 'user' | 'group' | 'channel';
    id: string;
    name?: string;
  };
  
  /** 消息内容 */
  content: {
    text: string;
    format?: 'plain' | 'markdown' | 'html';
  };
  
  /** 媒体附件（可选） */
  media?: Media[];
  
  /** 回复目标（可选） */
  replyTo?: {
    /** 回复的目标消息 ID */
    id: string;
    /** 引用文本（可选） */
    quoteText?: string;
  };
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `messageId` | `string` | ❌ | 消息的唯一标识符，如不提供则自动生成 UUID |
| `channelId` | `string` | ✅ | 频道的唯一标识符 |
| `target` | `object` | ✅ | 消息的目标接收者 |
| `target.type` | `string` | ✅ | 目标类型：`user`（用户）、`group`（群组）、`channel`（频道） |
| `target.id` | `string` | ✅ | 目标的唯一标识符 |
| `target.name` | `string` | ❌ | 目标的显示名称 |
| `content` | `object` | ✅ | 消息的内容信息 |
| `content.text` | `string` | ✅ | 消息的文本内容 |
| `content.format` | `string` | ❌ | 文本格式：`plain`、`markdown`、`html`，默认为 `plain` |
| `media` | `array` | ❌ | 媒体附件数组，参见 [媒体附件](#媒体附件-media) |
| `replyTo` | `object` | ❌ | 回复引用对象：`{ id: string; quoteText?: string }` |

---

## 消息字段详解

### 发送者 (Sender)

消息发送者的信息。

```typescript
interface Sender {
  /** 发送者 ID */
  id: string;
  
  /** 发送者显示名称 */
  name?: string;
  
  /** 发送者头像 URL */
  avatar?: string;
}
```

#### 示例

```json
{
  "id": "user_12345",
  "name": "张三",
  "avatar": "https://example.com/avatar.jpg"
}
```

---

### 目标 (Target)

消息的目标接收者。

```typescript
interface Target {
  /** 目标类型 */
  type: 'user' | 'group' | 'channel';
  
  /** 目标 ID */
  id: string;
  
  /** 目标名称 */
  name?: string;
}
```

#### 目标类型说明

| 类型 | 说明 | ID 格式示例 |
|------|------|-------------|
| `user` | 单个用户 | `user_12345` |
| `group` | 群组 | `group_67890` |
| `channel` | 频道 | `channel_abc123` |

#### 示例

```json
{
  "type": "user",
  "id": "user_12345",
  "name": "李四"
}
```

---

### 消息内容 (Content)

消息的文本内容及格式。

```typescript
interface Content {
  /** 文本内容 */
  text: string;
  
  /** 内容格式 */
  format?: 'plain' | 'markdown' | 'html';
}
```

#### 格式类型

| 格式 | 说明 | 示例 |
|------|------|------|
| `plain` | 纯文本（默认） | `"这是一条普通消息"` |
| `markdown` | Markdown 格式 | `"**粗体** *斜体* [链接](https://example.com)"` |
| `html` | HTML 格式 | `"<b>粗体</b> <i>斜体</i>"` |

#### 示例

##### 纯文本

```json
{
  "text": "你好，这是一条测试消息",
  "format": "plain"
}
```

##### Markdown

```json
{
  "text": "# 标题\n\n这是**粗体**文本和*斜体*文本。\n\n- 列表项 1\n- 列表项 2",
  "format": "markdown"
}
```

##### HTML

```json
{
  "text": "<h1>标题</h1><p>这是一段<strong>HTML</strong>内容</p>",
  "format": "html"
}
```

---

### 媒体附件 (Media)

媒体文件的附件信息。

```typescript
interface Media {
  /** 媒体类型 */
  type: 'image' | 'audio' | 'video' | 'file';
  
  /** 媒体文件 URL */
  url: string;
  
  /** 文件 MIME 类型 */
  mimeType?: string;
  
  /** 文件大小（字节） */
  size?: number;
  
  /** 文件名 */
  filename?: string;
  
  /** 缩略图 URL（适用于图片和视频） */
  thumbnail?: string;
  
  /** 媒体时长（秒，适用于音视频） */
  duration?: number;
  
  /** 图片/视频尺寸 */
  dimensions?: {
    width: number;
    height: number;
  };
}
```

#### 媒体类型说明

| 类型 | 说明 | 常见 MIME 类型 |
|------|------|----------------|
| `image` | 图片文件 | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| `audio` | 音频文件 | `audio/mpeg`, `audio/wav`, `audio/ogg` |
| `video` | 视频文件 | `video/mp4`, `video/webm`, `video/quicktime` |
| `file` | 其他文件 | `application/pdf`, `application/zip`, 等 |

#### 示例

##### 图片附件

```json
{
  "type": "image",
  "url": "https://example.com/images/photo.jpg",
  "mimeType": "image/jpeg",
  "size": 524288,
  "filename": "photo.jpg",
  "thumbnail": "https://example.com/images/photo_thumb.jpg",
  "dimensions": {
    "width": 1920,
    "height": 1080
  }
}
```

##### 音频附件

```json
{
  "type": "audio",
  "url": "https://example.com/audio/song.mp3",
  "mimeType": "audio/mpeg",
  "size": 3145728,
  "filename": "song.mp3",
  "duration": 180
}
```

##### 视频附件

```json
{
  "type": "video",
  "url": "https://example.com/videos/clip.mp4",
  "mimeType": "video/mp4",
  "size": 10485760,
  "filename": "clip.mp4",
  "thumbnail": "https://example.com/videos/clip_thumb.jpg",
  "duration": 60,
  "dimensions": {
    "width": 1280,
    "height": 720
  }
}
```

##### 文件附件

```json
{
  "type": "file",
  "url": "https://example.com/files/document.pdf",
  "mimeType": "application/pdf",
  "size": 1048576,
  "filename": "document.pdf"
}
```

---

### 消息回复 (ReplyTo)

用于标识回复的目标消息。

```typescript
type ReplyTo = string;  // 目标消息的 ID
```

#### 示例

```json
{
  "replyTo": "msg_abc123def456"
}
```

---

## 消息类型说明

系统支持以下消息类型（`messageType` 字段）：

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `text` | 纯文本消息 | 普通文字聊天 |
| `image` | 图片消息 | 发送图片 |
| `audio` | 音频消息 | 语音消息、音乐分享 |
| `video` | 视频消息 | 视频分享 |
| `file` | 文件消息 | 文档、压缩包等文件 |
| `system` | 系统消息 | 系统通知、提示信息 |

### 消息类型判定规则

消息类型由以下规则自动判定（或在请求中明确指定）：

1. 如果 `media` 数组存在且包含媒体：
   - 第一个媒体项的 `type` 决定消息类型
   - 例如：`media[0].type === 'image'` → `messageType = 'image'`

2. 如果没有媒体附件：
   - 默认为 `text` 类型

3. 系统消息：
   - 需要在后端逻辑中明确标记为 `system`

---

## API 端点

### 转发消息到 OpenClaw

向 OpenClaw 网关转发消息。

**端点：** `POST /api/channel/messages`

**认证：** 需要在请求头中提供频道认证令牌

**请求头：**

| 请求头 | 必填 | 说明 |
|--------|------|------|
| `X-Channel-Token` | ✅ | 频道访问令牌 |
| `X-Channel-ID` | ✅ | 频道 ID（用于日志和验证） |
| `Content-Type` | ✅ | 必须为 `application/json` |

**响应格式：**

##### 成功响应

```json
{
  "success": true,
  "messageId": "msg_abc123",
  "deliveredAt": "2026-02-13T10:30:00.000Z"
}
```

##### 错误响应

```json
{
  "success": false,
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

**错误代码：**

| 错误代码 | 说明 |
|----------|------|
| `UNAUTHORIZED` | 认证失败，令牌无效 |
| `INVALID_REQUEST` | 请求格式错误 |
| `CHANNEL_NOT_FOUND` | 频道不存在 |
| `CHANNEL_DISABLED` | 频道已被禁用 |
| `INVALID_TARGET` | 目标格式错误 |
| `MISSING_CONTENT` | 缺少消息内容 |

---

## 完整示例

### 示例 1：发送纯文本消息

**请求：**

```bash
curl -X POST http://localhost:3000/api/channel/messages \
  -H "Content-Type: application/json" \
  -H "X-Channel-Token: wh_2835b6943ab548dda29b2538ca18e1ef" \
  -H "X-Channel-ID: 23ade6a3-b393-4ed3-895c-41420162e334" \
  -d '{
    "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
    "messageId": "msg_001",
    "target": {
      "type": "user",
      "id": "user_12345",
      "name": "测试用户"
    },
    "content": {
      "text": "你好！这是一条测试消息。"
    }
  }'
```

**响应：**

```json
{
  "success": true,
  "messageId": "msg_001",
  "deliveredAt": "2026-02-13T10:30:00.000Z"
}
```

---

### 示例 2：发送图片消息

**请求：**

```bash
curl -X POST http://localhost:3000/api/channel/messages \
  -H "Content-Type: application/json" \
  -H "X-Channel-Token: wh_2835b6943ab548dda29b2538ca18e1ef" \
  -H "X-Channel-ID: 23ade6a3-b393-4ed3-895c-41420162e334" \
  -d '{
    "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
    "messageId": "msg_002",
    "target": {
      "type": "user",
      "id": "user_12345"
    },
    "content": {
      "text": "看看这张照片！"
    },
    "media": [
      {
        "type": "image",
        "url": "https://example.com/photo.jpg",
        "mimeType": "image/jpeg",
        "size": 524288,
        "filename": "photo.jpg"
      }
    ]
  }'
```

**响应：**

```json
{
  "success": true,
  "messageId": "msg_002",
  "deliveredAt": "2026-02-13T10:31:00.000Z"
}
```

---

### 示例 3：发送带 Markdown 格式的消息

**请求：**

```json
{
  "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
  "messageId": "msg_003",
  "target": {
    "type": "group",
    "id": "group_67890",
    "name": "开发组"
  },
  "content": {
    "text": "# 重要通知\n\n请大家注意以下事项：\n\n1. **代码审查** - 每周五进行\n2. *测试环境* - 已更新至最新版本\n3. 部署计划 - 见 [这里](https://example.com/plan)",
    "format": "markdown"
  }
}
```

---

### 示例 4：发送视频消息

**请求：**

```json
{
  "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
  "messageId": "msg_004",
  "target": {
    "type": "user",
    "id": "user_12345"
  },
  "content": {
    "text": "分享一个演示视频"
  },
  "media": [
    {
      "type": "video",
      "url": "https://example.com/demo.mp4",
      "mimeType": "video/mp4",
      "size": 10485760,
      "filename": "demo.mp4",
      "thumbnail": "https://example.com/demo_thumb.jpg",
      "duration": 120,
      "dimensions": {
        "width": 1920,
        "height": 1080
      }
    }
  ]
}
```

---

### 示例 5：回复消息

**请求：**

```json
{
  "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
  "messageId": "msg_005",
  "target": {
    "type": "user",
    "id": "user_12345"
  },
  "content": {
    "text": "收到！我马上处理。"
  },
  "replyTo": "msg_001"
}
```

---

### 示例 6：发送多个附件

**请求：**

```json
{
  "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
  "messageId": "msg_006",
  "target": {
    "type": "group",
    "id": "group_67890"
  },
  "content": {
    "text": "会议资料已整理完毕"
  },
  "media": [
    {
      "type": "file",
      "url": "https://example.com/meeting-notes.pdf",
      "mimeType": "application/pdf",
      "size": 1048576,
      "filename": "会议记录.pdf"
    },
    {
      "type": "file",
      "url": "https://example.com/slides.pptx",
      "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "size": 5242880,
      "filename": "演示文稿.pptx"
    },
    {
      "type": "image",
      "url": "https://example.com/chart.png",
      "mimeType": "image/png",
      "size": 204800,
      "filename": "数据图表.png",
      "dimensions": {
        "width": 1200,
        "height": 800
      }
    }
  ]
}
```

---

### 示例 7：入站消息（接收）

从 OpenClaw 接收的入站消息示例：

**Webhook 推送格式：**

```json
{
  "id": "msg_incoming_001",
  "channelId": "23ade6a3-b393-4ed3-895c-41420162e334",
  "timestamp": 1707820200000,
  "sender": {
    "id": "user_67890",
    "name": "王五",
    "avatar": "https://example.com/avatar2.jpg"
  },
  "content": {
    "text": "大家好！",
    "format": "plain"
  }
}
```

---

## 注意事项

### 1. 文件大小限制

建议限制：
- **图片**：最大 5MB
- **音频**：最大 10MB
- **视频**：最大 50MB
- **文件**：最大 20MB

### 2. URL 有效性

- 所有媒体 URL 必须是可公开访问的 HTTP/HTTPS 链接
- URL 应该长期有效，避免使用临时链接
- 建议使用 CDN 或对象存储服务

### 3. 消息 ID 生成

- 如果不提供 `messageId`，系统会自动生成 UUID
- 建议使用有意义的前缀，如 `msg_`, `test_` 等
- 消息 ID 在同一频道内应保持唯一

### 4. 时间戳格式

- 使用 Unix 时间戳（毫秒）
- JavaScript: `Date.now()`
- Python: `int(time.time() * 1000)`

### 5. 字符编码

- 所有文本内容使用 UTF-8 编码
- JSON 请求体必须是有效的 UTF-8

### 6. 速率限制

建议实施速率限制：
- 每个频道：100 条消息/分钟
- 每个用户：30 条消息/分钟

---

## 相关文档

- [频道 API 文档](./api/channel-api.zh.md)
- [认证与安全](./api/authentication.zh.md)
- [WebSocket 连接](./api/websocket.zh.md)
- [错误处理指南](./api/error-handling.zh.md)

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-02-13 | 初始版本，包含所有消息类型定义 |

---

## 支持与反馈

如有问题或建议，请：
- 提交 Issue：https://github.com/chatu-ai/chatu-web-hub-service/issues
- 联系邮箱：support@example.com
