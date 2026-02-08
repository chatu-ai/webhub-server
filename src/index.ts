import { initDatabase } from './db/schema.js';
import { WebHubServer } from './http/server.js';
import { createLogger, getLogger } from './utils/logger.js';

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);

async function main(): Promise<void> {
  const logger = createLogger({ name: 'webhub' });
  logger.info({ event: 'startup', message: 'Starting WebHub Service...' });

  try {
    // Initialize database (async)
    await initDatabase();
    logger.info({ event: 'db_ready', message: 'Database initialized' });

    // Initialize HTTP server
    const httpServer = new WebHubServer({
      port: HTTP_PORT,
      logger,
    });

    await httpServer.start();

    logger.info({
      event: 'started',
      httpPort: HTTP_PORT,
      message: 'WebHub Service started',
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal, event: 'shutdown', message: 'Shutting down gracefully...' });

      await httpServer.stop();

      logger.info({ event: 'stopped', message: 'WebHub Service stopped' });
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error: (error as Error).message, event: 'startup_error' });
    process.exit(1);
  }
}

main();
