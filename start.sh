#!/bin/sh
# Start nginx in background and node in foreground

# Create necessary directories
mkdir -p /tmp/nginx /var/run /var/log/nginx

# Start nginx in background
nginx &

# Give nginx time to start
sleep 1

# Start node backend in foreground
exec node backend/dist/index.js
