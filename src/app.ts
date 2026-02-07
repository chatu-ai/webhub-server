import express, { Application } from 'express';
import cors from 'cors';
import config from './config';
import apiRouter from './api';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app: Application = express();

  // Middleware
  app.use(cors({ origin: config.cors.origin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // API Routes
  app.use('/api', apiRouter);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        message: 'Welcome to Chatu Web Hub Service',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          info: '/api/info',
        },
      },
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
