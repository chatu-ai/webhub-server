/**
 * authRouter.ts
 *
 * Express router for authentication endpoints.
 * All routes under /api/webhub/auth  (mounted WITHOUT authMiddleware).
 *
 * Routes:
 *   GET  /api/webhub/auth/config  — Returns current authMode (PUBLIC)
 *   POST /api/webhub/auth/login   — Validates credentials, returns JWT
 *   GET  /api/webhub/auth/me      — Returns current user info (REQUIRES token)
 */

import { Router, Request, Response } from 'express';
import { login, verifyToken, getTokenExpiresAt } from '../services/authService';
import { authMiddleware } from '../middleware/authMiddleware';

const authRouter = Router();

/** Brute-force protection for login endpoint: max 10 attempts per IP per minute. */
const loginRateMap = new Map<string, number[]>();
function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const max = 10;
  const timestamps = (loginRateMap.get(ip) ?? []).filter(t => now - t < window);
  timestamps.push(now);
  loginRateMap.set(ip, timestamps);
  return timestamps.length > max;
}

/**
 * GET /api/webhub/auth/config
 * Returns the current authentication mode so the frontend can decide
 * whether to show the login screen.
 * This endpoint is always public (no auth required).
 */
authRouter.get('/config', (_req: Request, res: Response) => {
  const authMode = process.env.AUTH_MODE ?? 'none';
  res.json({
    success: true,
    data: {
      authMode: authMode === 'password' ? 'password' : 'none',
    },
  });
});

/**
 * POST /api/webhub/auth/login
 * Body: { username: string, password: string }
 * Returns: { token, expiresAt, username } on success, 401 on failure
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (isLoginRateLimited(ip)) {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many login attempts. Please try again later.',
    });
    return;
  }

  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      error: 'username and password are required',
    });
    return;
  }

  try {
    const token = login(username, password);
    if (!token) {
      res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid username or password',
      });
      return;
    }

    const expiresAt = getTokenExpiresAt();
    res.json({
      success: true,
      data: {
        token,
        expiresAt,
        username,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      error: err.message ?? 'Authentication error',
    });
  }
});

/**
 * GET /api/webhub/auth/me
 * Returns info about the currently authenticated user.
 * Requires valid Bearer token.
 */
authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authUser = (req as any).authUser;
  const expireHours = parseInt(process.env.TOKEN_EXPIRE_HOURS ?? '8760', 10);

  // Compute expiresAt from token's exp claim if available
  const expiresAt = authUser.exp
    ? new Date(authUser.exp * 1000).toISOString()
    : new Date(Date.now() + expireHours * 60 * 60 * 1000).toISOString();

  res.json({
    success: true,
    data: {
      username: authUser.username,
      expiresAt,
    },
  });
});

export default authRouter;
