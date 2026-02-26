#!/bin/sh
# Start script — behaviour controlled by ENABLE_FRONTEND env var
# ENABLE_FRONTEND=true  → backend + nginx (frontend UI served via nginx)
# ENABLE_FRONTEND=false → backend only, exposed directly on HTTP_PORT (default)

# Create required runtime directories
mkdir -p /tmp/nginx /var/run /var/log/nginx

if [ "$ENABLE_FRONTEND" = "true" ]; then
    # Validate frontend assets exist
    if [ ! -f /usr/share/nginx/html/index.html ]; then
        echo "ERROR: ENABLE_FRONTEND=true but /usr/share/nginx/html/index.html not found" >&2
        exit 1
    fi

    # Start backend in background
    echo "Starting backend..."
    node /app/backend/dist/index.js &
    BACKEND_PID=$!

    # Wait for backend to be ready (up to 15 seconds)
    echo "Waiting for backend to start..."
    i=1
    while [ $i -le 15 ]; do
        if node -e "require('http').get('http://127.0.0.1:3000/health', \
            function(r){ process.exit(r.statusCode === 200 ? 0 : 1) }) \
            .on('error', function(){ process.exit(1) })" 2>/dev/null; then
            echo "Backend is ready."
            break
        fi
        sleep 1
        i=$((i + 1))
    done

    # Start nginx in foreground (daemon off is set in nginx.conf)
    echo "Starting nginx..."
    nginx

    # Keep container alive by waiting for the backend process
    wait $BACKEND_PID
else
    # Backend-only mode: exec as PID 1 for correct signal forwarding
    echo "Starting backend (frontend UI disabled)..."
    exec node /app/backend/dist/index.js
fi
