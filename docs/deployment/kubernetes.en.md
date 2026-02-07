---
title: Kubernetes Deployment
title_zh: Kubernetes 部署
language: en
languages:
  - { id: en, name: English, link: ./kubernetes.md }
  - { id: zh, name: 中文, link: ./kubernetes.zh.md }
---

# Kubernetes Deployment

This guide covers deploying WebHub to Kubernetes with manifests for ConfigMap, PersistentVolumeClaim, Service, and optional HorizontalPodAutoscaler.

## Prerequisites

- Kubernetes 1.20+
- kubectl configured
- (Optional) Helm 3.x

## Directory Structure

```
deployment/kubernetes/
├── namespace.yaml
├── configmap.yaml
├── pvc.yaml
├── deployment.yaml
├── service.yaml
└── hpa.yaml (optional)
```

## Manifest Files

### 1. Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webhub
  labels:
    app: webhub
```

### 2. ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: webhub-config
  namespace: webhub
data:
  NODE_ENV: "production"
  PORT: "3000"
  DB_PATH: "/app/data/webhub.db"
```

### 3. PersistentVolumeClaim

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: webhub-data
  namespace: webhub
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

### 4. Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhub
  namespace: webhub
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webhub
  template:
    metadata:
      labels:
        app: webhub
    spec:
      containers:
        - name: webhub
          image: chatu-ai/webhub:latest
          ports:
            - containerPort: 80
              name: http
            - containerPort: 3000
              name: api
          envFrom:
            - configMapRef:
                name: webhub-config
          volumeMounts:
            - name: data-volume
              mountPath: /app/data
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data-volume
          persistentVolumeClaim:
            claimName: webhub-data
```

### 5. Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: webhub
  namespace: webhub
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: api
      port: 3000
      targetPort: api
  selector:
    app: webhub
```

### 6. HorizontalPodAutoscaler (Optional)

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: webhub
  namespace: webhub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: webhub
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Deployment Commands

```bash
# Apply all manifests
kubectl apply -f deployment/kubernetes/

# Check deployment status
kubectl get pods -n webhub

# View logs
kubectl logs -f deployment/webhub -n webhub

# Scale deployment
kubectl scale deployment webhub --replicas=3 -n webhub
```

## Service Types

### ClusterIP (Default)

```yaml
spec:
  type: ClusterIP
```

Internal access only within the cluster.

### NodePort

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```

Access via node IP on port 30080.

### LoadBalancer

```yaml
spec:
  type: LoadBalancer
  loadBalancerIP: "your-ip"
```

Provision external load balancer (cloud provider required).

## Cleanup

```bash
# Delete all resources
kubectl delete -f deployment/kubernetes/
```

---

## WebSocket Configuration

For WebSocket connections, add annotation and timeout settings:

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhub
  namespace: webhub
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "7200"
    nginx.ingress.kubernetes.io/websocket-services: "webhub"
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  rules:
    - host: webhub.example.com
      http:
        paths:
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: webhub
                port:
                  number: 3000
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: webhub
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webhub-web
                port:
                  number: 80
```

## SDK Connection Configuration

```typescript
// Inside K8s cluster
const channel = new Channel({
  webhubUrl: 'http://webhub-backend.webhub.svc.cluster.local:3000',
  channelId: 'wh_xxx',
  accessToken: 'token_xxx',
});

// Outside K8s cluster (via Ingress)
const channel = new Channel({
  webhubUrl: 'https://webhub.example.com',
  channelId: 'wh_xxx',
  accessToken: 'token_xxx',
});
```

### K8s Service DNS

| Type | DNS Format |
|------|------------|
| Internal | `http://<service>.<namespace>.svc.cluster.local:<port>` |
| External | `http://<ingress-host>` |

---

# Kubernetes 部署

本指南介绍如何将 WebHub 部署到 Kubernetes，包括 ConfigMap、PersistentVolumeClaim、Service 和可选的 HorizontalPodAutoscaler 清单。

## 前置条件

- Kubernetes 1.20+
- kubectl 已配置
- （可选）Helm 3.x

## 目录结构

```
deployment/kubernetes/
├── namespace.yaml
├── configmap.yaml
├── pvc.yaml
├── deployment.yaml
├── service.yaml
└── hpa.yaml (可选)
```

## 清单文件

### 1. 命名空间

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webhub
  labels:
    app: webhub
```

### 2. ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: webhub-config
  namespace: webhub
data:
  NODE_ENV: "production"
  PORT: "3000"
  DB_PATH: "/app/data/webhub.db"
```

### 3. PersistentVolumeClaim

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: webhub-data
  namespace: webhub
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

### 4. Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhub
  namespace: webhub
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webhub
  template:
    metadata:
      labels:
        app: webhub
    spec:
      containers:
        - name: webhub
          image: chatu-ai/webhub:latest
          ports:
            - containerPort: 80
              name: http
            - containerPort: 3000
              name: api
          envFrom:
            - configMapRef:
                name: webhub-config
          volumeMounts:
            - name: data-volume
              mountPath: /app/data
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data-volume
          persistentVolumeClaim:
            claimName: webhub-data
```

### 5. Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: webhub
  namespace: webhub
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: api
      port: 3000
      targetPort: api
  selector:
    app: webhub
```

### 6. HorizontalPodAutoscaler（可选）

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: webhub
  namespace: webhub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: webhub
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## 部署命令

```bash
# 应用所有清单
kubectl apply -f deployment/kubernetes/

# 检查部署状态
kubectl get pods -n webhub

# 查看日志
kubectl logs -f deployment/webhub -n webhub

# 扩展部署
kubectl scale deployment webhub --replicas=3 -n webhub
```

## Service 类型

### ClusterIP（默认）

```yaml
spec:
  type: ClusterIP
```

仅限集群内部访问。

### NodePort

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```

通过节点 IP 在端口 30080 访问。

### LoadBalancer

```yaml
spec:
  type: LoadBalancer
  loadBalancerIP: "your-ip"
```

配置外部负载均衡器（需要云提供商支持）。

## 清理

```bash
# 删除所有资源
kubectl delete -f deployment/kubernetes/
```
