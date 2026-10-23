import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Database, Tx } from './db.js';
import { refreshTokens, users } from './schema.js';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_MS = 30 * 24 * 3600_000;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASSWORD = 8;
const BLOCKED_NAME_PARTS = ['admin', 'moderator', 'ringfall', 'fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape'];

export function usernameProblem(name: string): string | null {
  if (!USERNAME_RE.test(name)) return 'Usernames are 3–16 letters, digits or _';
  const lower = name.toLowerCase();
  if (BLOCKED_NAME_PARTS.some((w) => lower.includes(w))) return 'That username isn’t allowed';
  return null;
}

// argon2id with the library's defaults (19 MiB, 2 passes): OWASP's recommended minimum.
export const hashPassword = (password: string): Promise<string> => hash(password);
export const verifyPassword = (passwordHash: string, password: string): Promise<boolean> =>
  verify(passwordHash, password).catch(() => false);

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newInviteCode = (): string =>
  `RF-${Array.from({ length: 5 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('')}`;

/** Accepts `RF-7KQ2M`, `rf7kq2m` or `7KQ2M`. */
export function normalizeInviteCode(code: string): string {
  const bare = code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^RF/, '');
  return `RF-${bare}`;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  accessTokenExpiresAt: number;
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(db: Database | Tx, userId: string): Promise<Tokens> {
    const now = Date.now();
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(now / 1000) + ACCESS_TOKEN_SECONDS)
      .sign(this.key);
    const refreshToken = randomBytes(32).toString('base64url');
    await db.insert(refreshTokens).values({
      userId, tokenHash: sha256(refreshToken), expiresAt: new Date(now + REFRESH_TOKEN_MS),
    });
    return { accessToken, refreshToken, accessTokenExpiresAt: now + ACCESS_TOKEN_SECONDS * 1000 };
  }

  /** Returns the user id, or null for a bad or expired token. */
  async verifyAccess(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  /** Swaps a refresh token for a new pair (rotation: the old one stops working). */
  async refresh(db: Database, refreshToken: string): Promise<Tokens | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx.update(refreshTokens)
        .set({ revokedAt: sql`now()` })
        .where(and(
          eq(refreshTokens.tokenHash, sha256(refreshToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, sql`now()`),
        ))
        .returning({ userId: refreshTokens.userId });
      if (!row) return null;
      return this.issue(tx, row.userId);
    });
  }

  async revoke(db: Database, refreshToken: string): Promise<void> {
    await db.update(refreshTokens).set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.tokenHash, sha256(refreshToken)), isNull(refreshTokens.revokedAt)));
  }
}

export async function findUserByName(db: Database | Tx, username: string) {
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  return user ?? null;
}

/** A small fixed-window limiter for login attempts, per key (IP + username). */
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Records an attempt; false once the key has used up its attempts in this window. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
