import { eq } from 'drizzle-orm';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { clearSessionCookie, setSessionCookie, signSession, verifyPassword } from '../../auth/session.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const authRouter = Router();

const LoginSchema = z.object({
  email: z.email('Enter a valid email').transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

// Brute-force protection on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in a few minutes.' } });
  },
});

authRouter.post('/login', loginLimiter, validate('body', LoginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof LoginSchema>;
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same message whether the email or the password is wrong — don't reveal which accounts exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.unauthenticated('Incorrect email or password');
  }
  const session = { id: user.id, role: user.role, name: user.name, email: user.email };
  setSessionCookie(res, signSession(session));
  res.json({ user: session });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});
