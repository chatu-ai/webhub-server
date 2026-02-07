import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/**
 * Service information endpoint
 * GET /api/info
 */
router.get('/info', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: 'chatu-web-hub-service',
      version: '1.0.0',
      description: 'Web hub server side service for Chatu',
    },
  });
});

export default router;
