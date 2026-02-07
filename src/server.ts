import { createServer } from 'http';
import { createApp } from './app';
import config from './config';
import websocketService from './websocket';
import logger from './utils/logger';

// Create Express app
const app = createApp();

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket service
websocketService.initialize(server);

// Start server
server.listen(config.port, config.host, () => {
  logger.info(`Server is running on http://${config.host}:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`WebSocket server is ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
