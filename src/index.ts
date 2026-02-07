import { WebHubServer } from './http/server';
import { WebSocketServerModule } from './ws/server';
import { InMemoryChannelStore } from './store/channelStore';
import { WebSocketMessageRouter, MessageQueue } from './router/messageRouter';
import { createLogger, getLogger } from './utils/logger';

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

async function main(): Promise<void> {
  const logger = createLogger({ name: 'webhub' });
  logger.info({ event: 'startup', message: 'Starting WebHub Service...' });

  // Initialize core components
  const channelStore = new InMemoryChannelStore();
  const messageQueue = new MessageQueue();
  const messageRouter = new WebSocketMessageRouter();

  // Initialize servers
  const httpServer = new WebHubServer({
    port: HTTP_PORT,
    channelStore,
    messageRouter,
    logger,
  });

  const wsServer = new WebSocketServerModule({
    port: WS_PORT,
    channelStore,
    messageRouter,
    logger,
  });

  // Start servers
  await Promise.all([httpServer.start(), wsServer.start()]);

  logger.info({
    event: 'started',
    httpPort: HTTP_PORT,
    wsPort: WS_PORT,
    message: 'WebHub Service started',
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, event: 'shutdown', message: 'Shutting down gracefully...' });

    await Promise.all([httpServer.stop(), wsServer.stop()]);

    logger.info({ event: 'stopped', message: 'WebHub Service stopped' });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  getLogger().error({ error: error.message, stack: error.stack, event: 'startup_error' });
  process.exit(1);
});
