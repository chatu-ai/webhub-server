# Kubernetes Ingress 配置

WebHub K8s 部署的 Ingress 配置，支持 HTTP、HTTPS 和 WebSocket。

## 目录结构

```
deployment/kubernetes/
├── namespace.yaml
├── configmap.yaml
├── pvc.yaml
├── deployment.yaml
├── service.yaml
├── ingress.yaml          # 新增：Ingress 配置
└── hpa.yaml (可选)
```

## Ingress 清单

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhub
  namespace: webhub
  annotations:
    # WebSocket 支持 (关键配置)
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "7200"
    nginx.ingress.kubernetes.io/websocket-services: "webhub-backend"
    nginx.ingress.kubernetes.io/use-regex: "true"
    
    # 可选：SSL 重定向
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    
    # 可选：性能优化
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: nginx
  rules:
    - host: webhub.example.com
      http:
        paths:
          # WebSocket 路径
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: webhub-backend
                port:
                  number: 80
          
          # API 路径
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: webhub-backend
                port:
                  number: 80
          
          # 前端静态资源
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webhub-web
                port:
                  number: 80

---
# 可选：TLS 配置
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhub-tls
  namespace: webhub
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - webhub.example.com
      secretName: webhub-tls-secret
  rules:
    - host: webhub.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webhub-backend
                port:
                  number: 80
```

## 关键注解说明

| 注解 | 值 | 用途 |
|------|-----|------|
| `proxy-read-timeout` | `3600` | WebSocket 读取超时 |
| `proxy-send-timeout` | `3600` | WebSocket 发送超时 |
| `proxy-connect-timeout` | `7200` | WebSocket 连接超时 |
| `websocket-services` | `webhub-backend` | 启用 WebSocket 代理 |
| `use-regex` | `true` | 启用路径正则匹配 |

## 部署命令

```bash
# 应用 Ingress
kubectl apply -f deployment/kubernetes/ingress.yaml

# 查看状态
kubectl get ingress -n webhub

# 查看详情
kubectl describe ingress webhub -n webhub
```

## SDK 连接示例

```typescript
// K8s 集群外部连接 (通过 Ingress)
const channel = new Channel({
  webhubUrl: 'https://webhub.example.com',  // Ingress 域名
  channelId: 'wh_xxx',
  accessToken: 'token_xxx',
});
```

## 本地开发 (NodePort)

无需 Ingress 时，可以使用 NodePort：

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: webhub-backend
  namespace: webhub
spec:
  type: NodePort
  selector:
    app: webhub-backend
  ports:
    - port: 80
      targetPort: 3000
      nodePort: 30080  # 通过 <node-ip>:30080 访问
```

## 故障排查

```bash
# 检查 Ingress Controller 日志
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# 检查后端服务健康
kubectl get endpoints -n webhub

# 测试连通性
kubectl exec -it -n webhub <pod-name> -- curl http://localhost:3000/health
```
