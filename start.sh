#!/bin/sh
# Start nginx in background and node in foreground

# Create necessary directories
mkdir -p /tmp/nginx /var/run /var/log/nginx

# Start node backend in background and wait for it
cd /app
node backend/dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready (up to 10 seconds)
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s http://127.0.0.1:3000/api/webhub/channels > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Start nginx in background
nginx &

# Wait for nginx to start
sleep 2

# Keep container running with backend in foreground
wait $BACKEND_PID
