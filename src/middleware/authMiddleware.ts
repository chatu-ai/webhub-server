/**
 * authMiddleware.ts
 *
 * Express middleware that enforces JWT authentication on protected routes.
 *
 * Behavior:
 *   - If AUTH_MODE is 'none' (or unset): skips validation and calls next()
 *   - If AUTH_MODE is 'password': expects "Authorization: Bearer <token>" header
 *     - Valid token → calls next()
 *     - Missing/invalid token → returns 401 JSON response
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authMode = process.env.AUTH_MODE ?? 'none';

  // In 'none' mode, bypass all authentication
  if (authMode === 'none') {
    next();
    return;
  }

  // Require Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      error: 'Token is invalid or has expired',
    });
    return;
  }

  // Attach decoded payload to request for downstream handlers
  (req as any).authUser = payload;
  next();
}
