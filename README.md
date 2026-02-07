# Chatu Web Hub Service

Web hub server-side service for Chatu - A real-time web hub with REST API and WebSocket support.

## Features

- 🚀 **Express.js** REST API server
- 🔌 **WebSocket** support for real-time communication
- 📝 **TypeScript** for type safety
- 🐳 **Docker** support for easy deployment
- 🔧 **Environment configuration** via .env files
- 📊 **Request logging** and error handling
- ✅ **Health check** endpoints

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Docker (optional, for containerized deployment)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/chatu-ai/chatu-web-hub-service.git
cd chatu-web-hub-service
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Edit `.env` file with your configuration (optional):
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=*
LOG_LEVEL=info
```

## Development

Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Build

Build the TypeScript code:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## API Endpoints

### REST API

- `GET /` - Welcome message and service information
- `GET /api/health` - Health check endpoint
- `GET /api/info` - Service information

Example response from `/api/health`:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-07T12:06:29.675Z",
    "uptime": 123.456
  }
}
```

### WebSocket

Connect to WebSocket server at the same port as the HTTP server.

#### WebSocket Message Format

All messages follow this format:
```json
{
  "type": "message_type",
  "data": { ... },
  "timestamp": "ISO8601 timestamp"
}
```

#### Supported Message Types

**Client to Server:**

1. **Ping** - Check connection
```json
{
  "type": "ping"
}
```

2. **Echo** - Echo back data
```json
{
  "type": "echo",
  "data": { "message": "Hello" }
}
```

3. **Broadcast** - Broadcast to all connected clients
```json
{
  "type": "broadcast",
  "data": { "message": "Hello everyone" }
}
```

**Server to Client:**

- `connected` - Connection established
- `pong` - Response to ping
- `echo` - Echo response
- `broadcast` - Broadcast message
- `error` - Error message

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Using Docker

Build the image:
```bash
docker build -t chatu-web-hub-service .
```

Run the container:
```bash
docker run -d -p 3000:3000 --name web-hub chatu-web-hub-service
```

## Project Structure

```
chatu-web-hub-service/
├── src/
│   ├── api/              # API routes
│   │   └── index.ts      # Main API router
│   ├── config/           # Configuration
│   │   └── index.ts      # Environment config
│   ├── middleware/       # Express middleware
│   │   ├── logger.ts     # Request logger
│   │   └── errorHandler.ts
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions
│   │   └── logger.ts     # Logger utility
│   ├── websocket/        # WebSocket service
│   │   └── index.ts      # WebSocket server
│   ├── app.ts            # Express application
│   └── server.ts         # Server entry point
├── dist/                 # Compiled JavaScript (generated)
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore rules
├── .dockerignore        # Docker ignore rules
├── Dockerfile           # Docker image definition
├── docker-compose.yml   # Docker Compose configuration
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md            # This file
```

## Scripts

- `npm run dev` - Start development server with ts-node
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run watch` - Watch TypeScript files for changes
- `npm run lint` - Lint TypeScript files

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `LOG_LEVEL` | Logging level | `info` |

## Testing

Connect to the WebSocket server using any WebSocket client:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

## License

MIT

## Author

Chatu AI