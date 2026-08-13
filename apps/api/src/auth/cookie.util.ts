import { CookieOptions } from 'express';

/**
 * The API and frontend live on different domains in production (App Runner
 * vs Vercel), so the auth cookie must be SameSite=None + Secure to be sent
 * cross-site. Locally (same "site": localhost, different ports) Lax is fine
 * and doesn't require HTTPS.
 */
export function authCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT expiry
    path: '/',
  };
}

export const AUTH_COOKIE_NAME = 'token';
