import { WebHubServer } from './http/server';
import { WebSocketServerModule } from './ws/server';
import { InMemoryChannelStore } from './store/channelStore';
import { WebSocketMessageRouter, MessageQueue } from './router/messageRouter';

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

async function main(): Promise<void> {
  console.log('Starting WebHub Service...');

  // Initialize core components
  const channelStore = new InMemoryChannelStore();
  const messageQueue = new MessageQueue();
  const messageRouter = new WebSocketMessageRouter();

  // Initialize servers
  const httpServer = new WebHubServer({
    port: HTTP_PORT,
    channelStore,
    messageRouter,
  });

  const wsServer = new WebSocketServerModule({
    port: WS_PORT,
    channelStore,
    messageRouter,
  });

  // Start servers
  await Promise.all([httpServer.start(), wsServer.start()]);

  console.log(`WebHub Service started:`);
  console.log(`  - HTTP API: http://localhost:${HTTP_PORT}`);
  console.log(`  - WebSocket: ws://localhost:${WS_PORT}`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    await Promise.all([httpServer.stop(), wsServer.stop()]);

    console.log('WebHub Service stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start WebHub Service:', error);
  process.exit(1);
});
