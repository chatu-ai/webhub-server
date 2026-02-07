# Kubernetes 部署

在 Kubernetes 上部署 WebHub 后端服务。

## 前置条件

- Kubernetes 集群 (1.20+)
- kubectl 已配置
- 可选：Helm 3.x

## 快速部署

```bash
# 应用所有清单
kubectl apply -f k8s/

# 查看状态
kubectl get pods -l app=webhub-backend

# 查看日志
kubectl logs -l app=webhub-backend -f
```

## 清单文件

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webhub
```

### pvc.yaml

```yaml
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

### configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: webhub-config
  namespace: webhub
data:
  NODE_ENV: "production"
  PORT: "3000"
```

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhub-backend
  namespace: webhub
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webhub-backend
  template:
    metadata:
      labels:
        app: webhub-backend
    spec:
      containers:
        - name: backend
          image: ghcr.io/chatu-ai/chatu-web-hub-service:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: webhub-config
          volumeMounts:
            - name: data
              mountPath: /app/data
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
        - name: data
          persistentVolumeClaim:
            claimName: webhub-data
```

### service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webhub-backend
  namespace: webhub
spec:
  selector:
    app: webhub-backend
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

## 一体化清单

将上述所有资源保存到 `k8s/all-in-one.yaml`。

部署：

```bash
kubectl apply -f k8s/all-in-one.yaml
```

## Ingress

添加 Ingress 以支持外部访问：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhub-ingress
  namespace: webhub
spec:
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
