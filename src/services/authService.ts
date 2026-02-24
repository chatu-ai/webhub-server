/**
 * authService.ts
 *
 * Handles admin authentication and JWT issuance/verification.
 * Reads credentials and configuration from environment variables:
 *
 *   AUTH_MODE         — 'none' | 'password' (default: 'none')
 *   AUTH_USERNAME     — admin username (default: 'admin')
 *   AUTH_PASSWORD     — admin password in plain text
 *   JWT_SECRET        — secret for HS256 signing (required in password mode)
 *   TOKEN_EXPIRE_HOURS — token expiry in hours (default: 8760 = 1 year)
 */

import jwt from 'jsonwebtoken';

export interface TokenPayload {
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * Attempt to log in with the given credentials.
 *
 * @returns A signed JWT string on success, or `null` on failure.
 */
export function login(username: string, password: string): string | null {
  const expectedUsername = process.env.AUTH_USERNAME ?? 'admin';
  const expectedPassword = process.env.AUTH_PASSWORD ?? '';
  const secret = process.env.JWT_SECRET ?? '';
  const expireHours = parseInt(process.env.TOKEN_EXPIRE_HOURS ?? '8760', 10);

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return null;
  }

  const expiresIn = `${expireHours}h`;
  const token = jwt.sign({ username } as TokenPayload, secret, {
    algorithm: 'HS256',
    expiresIn,
  } as jwt.SignOptions);

  return token;
}

/**
 * Verify a JWT token and return its decoded payload, or `null` if invalid/expired.
 */
export function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Return `expiresAt` as an ISO 8601 string for a freshly issued token.
 */
export function getTokenExpiresAt(): string {
  const expireHours = parseInt(process.env.TOKEN_EXPIRE_HOURS ?? '8760', 10);
  const expiresAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}
