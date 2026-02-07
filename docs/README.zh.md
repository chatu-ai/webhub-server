# WebHub 文档

WebHub 是一个独立的 Web 服务，用于将网站与 OpenClaw 连接，实现实时消息传递。

## 架构

```
┌─────────────┐     REST/WebSocket      ┌─────────────┐
│  前端       │ ←────────────────────→ │  后端       │
│  (管理界面) │                        │  服务       │
└─────────────┘                        └──────┬──────┘
                                               │
                                               │ Channel SDK
                                               ▼
                                        ┌─────────────┐
                                        │  OpenClaw   │
                                        │  网关       │
                                        └─────────────┘
```

## 功能特性

- **频道管理**: 创建、列出、删除频道
- **消息路由**: HTTP API 和 WebSocket 支持
- **SQLite 持久化**: 频道和消息存储在 SQLite 中
- **TypeScript**: 完整的类型安全

## 快速开始

详细设置说明请参考[部署指南](deployment/docker.zh.md)。

## 文档结构

- [部署](deployment/)
  - [Docker](deployment/docker.zh.md)
  - [Kubernetes](deployment/kubernetes.zh.md)
- [API 参考](api/)
  - [频道 API](api/channels.zh.md)

## 相关项目

| 项目 | 描述 |
|------|------|
| [openclaw-web-hub-channel](https://github.com/chatu-ai/openclaw-web-hub-channel) | Channel SDK |
| [chatu-web-hub-front](https://github.com/chatu-ai/chatu-web-hub-front) | 参考前端 UI |
