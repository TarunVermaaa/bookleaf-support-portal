import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession, type SessionUser } from '../auth/session.js';
import type { Role } from '../db/schema.js';
import { ApiError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Authentication: every protected route needs a valid session cookie (or a Bearer token for API clients). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const token = req.cookies?.[SESSION_COOKIE] ?? bearer;
  const user = token ? verifySession(token) : null;
  if (!user) return next(ApiError.unauthenticated());
  req.user = user;
  next();
}

/** Authorization: restrict a route to specific roles. Ownership checks (author → own data) live in the services. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthenticated());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

/** Narrow helper for handlers that already ran requireAuth. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw ApiError.unauthenticated();
  return req.user;
}
