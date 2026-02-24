/**
 * authService.test.ts
 *
 * Unit tests for authService — login, token verification, expiry.
 */

import jwt from 'jsonwebtoken';
import { login, verifyToken, getTokenExpiresAt } from './authService';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

beforeEach(() => {
  process.env.AUTH_USERNAME = 'admin';
  process.env.AUTH_PASSWORD = 'correct-password';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TOKEN_EXPIRE_HOURS = '8760';
});

afterEach(() => {
  delete process.env.AUTH_USERNAME;
  delete process.env.AUTH_PASSWORD;
  delete process.env.JWT_SECRET;
  delete process.env.TOKEN_EXPIRE_HOURS;
});

describe('login()', () => {
  it('returns a JWT string when credentials are correct', () => {
    const token = login('admin', 'correct-password');
    expect(typeof token).toBe('string');
    expect(token).not.toBeNull();

    // Verify it's a valid JWT
    const payload = jwt.verify(token!, TEST_SECRET) as any;
    expect(payload.username).toBe('admin');
  });

  it('returns null for wrong password', () => {
    const token = login('admin', 'wrong-password');
    expect(token).toBeNull();
  });

  it('returns null for wrong username', () => {
    const token = login('not-admin', 'correct-password');
    expect(token).toBeNull();
  });

  it('returns null when both username and password are wrong', () => {
    const token = login('hacker', 'guess');
    expect(token).toBeNull();
  });

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => login('admin', 'correct-password')).toThrow('JWT_SECRET is not configured');
  });

  it('uses default username "admin" when AUTH_USERNAME not set', () => {
    delete process.env.AUTH_USERNAME;
    process.env.AUTH_PASSWORD = '';
    const token = login('admin', '');
    expect(token).not.toBeNull();
  });

  it('respects TOKEN_EXPIRE_HOURS for token expiry', () => {
    process.env.TOKEN_EXPIRE_HOURS = '24';
    const token = login('admin', 'correct-password')!;
    const payload = jwt.decode(token) as any;
    const expectedExpiry = Math.floor(Date.now() / 1000) + 24 * 3600;
    // Allow ±5 seconds tolerance
    expect(Math.abs(payload.exp - expectedExpiry)).toBeLessThanOrEqual(5);
  });
});

describe('verifyToken()', () => {
  it('returns payload for a valid token', () => {
    const token = login('admin', 'correct-password')!;
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.username).toBe('admin');
  });

  it('returns null for an invalid token', () => {
    const result = verifyToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('returns null for a token signed with wrong secret', () => {
    const badToken = jwt.sign({ username: 'admin' }, 'wrong-secret', { expiresIn: '1h' });
    const result = verifyToken(badToken);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', () => {
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign({ username: 'admin' }, TEST_SECRET, { expiresIn: -1 });
    const result = verifyToken(expiredToken);
    expect(result).toBeNull();
  });

  it('returns null when JWT_SECRET is not set', () => {
    const token = login('admin', 'correct-password')!;
    delete process.env.JWT_SECRET;
    const result = verifyToken(token);
    expect(result).toBeNull();
  });
});

describe('getTokenExpiresAt()', () => {
  it('returns an ISO 8601 date string', () => {
    const expiresAt = getTokenExpiresAt();
    expect(typeof expiresAt).toBe('string');
    expect(() => new Date(expiresAt)).not.toThrow();
    const date = new Date(expiresAt);
    expect(date.toISOString()).toBe(expiresAt);
  });

  it('is approximately TOKEN_EXPIRE_HOURS hours from now', () => {
    process.env.TOKEN_EXPIRE_HOURS = '24';
    const expiresAt = new Date(getTokenExpiresAt()).getTime();
    const expected = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(1000);
  });
});
