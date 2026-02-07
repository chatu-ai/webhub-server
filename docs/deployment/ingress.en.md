# Kubernetes Ingress Configuration

Ingress configuration for WebHub K8s deployment, supporting HTTP, HTTPS, and WebSocket.

## Directory Structure

```
deployment/kubernetes/
├── namespace.yaml
├── configmap.yaml
├── pvc.yaml
├── deployment.yaml
├── service.yaml
├── ingress.yaml          # NEW: Ingress configuration
└── hpa.yaml (optional)
```

## Ingress Manifest

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhub
  namespace: webhub
  annotations:
    # WebSocket support (critical)
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "7200"
    nginx.ingress.kubernetes.io/websocket-services: "webhub-backend"
    nginx.ingress.kubernetes.io/use-regex: "true"
    
    # Optional: SSL redirect
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    
    # Optional: Performance optimization
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: nginx
  rules:
    - host: webhub.example.com
      http:
        paths:
          # WebSocket path
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: webhub-backend
                port:
                  number: 80
          
          # API path
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: webhub-backend
                port:
                  number: 80
          
          # Frontend static files
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webhub-web
                port:
                  number: 80

---
# Optional: TLS configuration
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

## Annotation Reference

| Annotation | Value | Purpose |
|------------|-------|---------|
| `proxy-read-timeout` | `3600` | WebSocket read timeout |
| `proxy-send-timeout` | `3600` | WebSocket send timeout |
| `proxy-connect-timeout` | `7200` | WebSocket connect timeout |
| `websocket-services` | `webhub-backend` | Enable WebSocket proxy |
| `use-regex` | `true` | Enable path regex matching |

## Deployment Commands

```bash
# Apply Ingress
kubectl apply -f deployment/kubernetes/ingress.yaml

# Check status
kubectl get ingress -n webhub

# View details
kubectl describe ingress webhub -n webhub
```

## SDK Connection Example

```typescript
// Outside K8s cluster (via Ingress)
const channel = new Channel({
  webhubUrl: 'https://webhub.example.com',  // Ingress hostname
  channelId: 'wh_xxx',
  accessToken: 'token_xxx',
});
```

## Local Development (NodePort)

Without Ingress, use NodePort:

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
      nodePort: 30080  # Access via <node-ip>:30080
```

## Troubleshooting

```bash
# Check Ingress Controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# Check backend service health
kubectl get endpoints -n webhub

# Test connectivity
kubectl exec -it -n webhub <pod-name> -- curl http://localhost:3000/health
```
