import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env.js';
import type { Role } from '../db/schema.js';

export const SESSION_COOKIE = 'bl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h working day

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

interface SessionClaims {
  sub: string;
  role: Role;
  name: string;
  email: string;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function signSession(user: SessionUser): string {
  const claims: SessionClaims = { sub: user.id, role: user.role, name: user.name, email: user.email };
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionUser | null {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as SessionClaims;
    return { id: claims.sub, role: claims.role, name: claims.name, email: claims.email };
  } catch {
    return null;
  }
}

// The JWT lives in an httpOnly cookie rather than localStorage: JavaScript on the page can't read it
// (XSS can't steal it), and the browser sends it automatically — including on the SSE connection,
// which can't carry custom Authorization headers.
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
