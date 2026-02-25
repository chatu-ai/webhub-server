#!/bin/sh
# Start nginx in background and node in foreground

# Create necessary directories
mkdir -p /tmp/nginx /var/run /var/log/nginx

# Start node backend in background
cd /app
node backend/dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready (up to 15 seconds)
echo "Waiting for backend to start..."
i=1
while [ $i -le 15 ]; do
  if node -e "require('http').get('http://127.0.0.1:3000/health', function(r){ process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', function(){ process.exit(1) })" 2>/dev/null; then
    echo "Backend is ready."
    break
  fi
  sleep 1
  i=$((i + 1))
done

# Start nginx in foreground (daemon off is set in nginx.conf)
nginx &

# Wait for nginx to start
sleep 1

# Keep container alive by waiting for the backend process
wait $BACKEND_PID
