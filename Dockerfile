# =============================================================================
# Stage 1: Build backend
# =============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Fetch frontend from GitHub Release
# =============================================================================
FROM alpine AS frontend-fetcher

ARG FRONTEND_VERSION=latest

RUN apk add --no-cache curl jq

RUN set -eux; \
    if [ "$FRONTEND_VERSION" = "latest" ]; then \
        VERSION=$(curl -sf \
            https://api.github.com/repos/chatu-ai/webhub-frontend/releases/latest \
            | jq -r '.tag_name') ; \
        [ -n "$VERSION" ] && [ "$VERSION" != "null" ] \
            || { echo "ERROR: Failed to fetch latest frontend version" >&2; exit 1; }; \
    else \
        VERSION="$FRONTEND_VERSION"; \
    fi; \
    SEMVER="${VERSION#v}"; \
    FILENAME="webhub-frontend-${SEMVER}.tar.gz"; \
    echo "Downloading ${FILENAME} ..."; \
    curl -fL \
        "https://github.com/chatu-ai/webhub-frontend/releases/download/${VERSION}/${FILENAME}" \
        -o "/tmp/${FILENAME}"; \
    mkdir -p /frontend; \
    tar -xzf "/tmp/${FILENAME}" -C /frontend; \
    rm "/tmp/${FILENAME}"; \
    echo "Frontend files:"; ls /frontend/

# =============================================================================
# Stage 3: Final runtime image (nginx + node)
# =============================================================================
FROM nginx:alpine

# Install Node.js (needed to run the backend)
RUN apk add --no-cache nodejs

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy backend artifacts
COPY --from=backend-builder /app/dist          ./backend/dist
COPY --from=backend-builder /app/node_modules  ./backend/node_modules
COPY --from=backend-builder /app/package.json  ./backend/package.json

# Copy frontend static files
COPY --from=frontend-fetcher /frontend /usr/share/nginx/html/

# Create required runtime directories
RUN mkdir -p /tmp/nginx /var/run /var/log/nginx /app/data

# Copy config and start script
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh   /start.sh
RUN chmod +x /start.sh

# Set ownership
RUN chown -R nodejs:nodejs /app /usr/share/nginx/html /tmp/nginx /var/run /var/log/nginx /start.sh

USER nodejs

# Environment variables — override at runtime with -e
ENV NODE_ENV=production
ENV HTTP_PORT=3000
ENV DB_PATH=/app/data/webhub.db
ENV UPLOAD_DIR=/app/data/uploads
# Set to "true" to start Nginx and serve the frontend UI
ENV ENABLE_FRONTEND=false

EXPOSE 3000 80

# Health check — backend liveness only
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/health', \
        (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["/start.sh"]
