import type { Army, BuildJob, BuildingType, Resources, TrainJob, UnitKey } from '@ringfall/rules';
import { storage } from './storage';
import type {
  BaseView, ConversationView, FriendsView, NearbyView, ReportDetail, ReportSummary, Session, ThreadView, User,
} from './types';

/** Set EXPO_PUBLIC_API_URL to your computer's LAN address (e.g. http://192.168.1.20:3000) to play on a phone. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SESSION_KEY = 'ringfall.session';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

// ── Session (tokens) ──────────────────────────────────────────────────────────

let session: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

export async function loadSession(): Promise<Session | null> {
  const raw = await storage.get(SESSION_KEY);
  try {
    session = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    session = null;
  }
  return session;
}

async function setSession(next: Session | null): Promise<void> {
  session = next;
  if (next) await storage.set(SESSION_KEY, JSON.stringify(next));
  else await storage.remove(SESSION_KEY);
  for (const fn of listeners) fn(next);
}

export function onSessionChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Requests ──────────────────────────────────────────────────────────────────

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh token for new tokens; one refresh at a time however many requests hit a 401. */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = session;
    if (!current) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        await setSession(null);
        return false;
      }
      const t = await res.json();
      await setSession({ ...current, accessToken: t.accessToken, refreshToken: t.refreshToken });
      return true;
    } catch {
      return false; // offline: keep the session and try again later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', `Can't reach the server at ${API_URL}.`);
  }
  if (res.status === 401 && retry && session && !path.startsWith('/auth/')) {
    if (await refreshTokens()) return request<T>(method, path, body, false);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? ERRORS[data?.error] ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Friendly text for the server's error codes. */
export const ERRORS: Record<string, string> = {
  max_level: 'Already at max level.',
  needs_command_center: 'Upgrade your Command Center first.',
  no_free_builder: 'All builders are busy.',
  already_upgrading: 'Already upgrading.',
  not_enough_resources: 'Not enough resources.',
  missing_building: 'You need a better building for this unit.',
  titan_cap: 'Your Titan Forge can’t hold more Titans.',
  not_enough_supply: 'Not enough supply. Upgrade your Habitat.',
  queue_full: 'This queue is full.',
  bad_quantity: 'Pick at least one unit.',
  not_enough_units: 'You don’t have that many units at home.',
  too_many_armies: 'Too many armies out. Upgrade your Command Center or wait for one to return.',
  target_protected: 'That commander is under beginner protection.',
  target_shielded: 'That base is shielded.',
  power_gap: 'That base is far weaker than you. Pick on someone your own size.',
  repeat_limit: 'You’ve hit that base 3 times today.',
  scouts_only_wisps: 'Scout missions can only send Wisp Drones.',
  cannot_attack_self: 'That’s your own base.',
  already_arrived: 'Too late: that army already arrived.',
  target_not_found: 'That target is gone.',
  not_friends: 'You can only message friends.',
  cannot_add: 'You can’t add that commander.',
  slow_down: 'Slow down a little.',
  tutorial_step_not_done: 'Finish this step first.',
  tutorial_finished: 'The tutorial is already finished.',
  nothing_to_rush: 'Nothing to speed up right now.',
};

export const errorText = (e: unknown): string =>
  e instanceof ApiError ? ERRORS[e.code] ?? e.message : e instanceof Error ? e.message : 'Something went wrong.';

// ── Endpoints ─────────────────────────────────────────────────────────────────

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

async function startSession(res: AuthResponse): Promise<Session> {
  const s = { user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken };
  await setSession(s);
  return s;
}

export const api = {
  register: async (username: string, password: string, inviteCode?: string) =>
    startSession(await request<AuthResponse>('POST', '/auth/register', { username, password, inviteCode: inviteCode || undefined })),
  login: async (username: string, password: string) =>
    startSession(await request<AuthResponse>('POST', '/auth/login', { username, password })),
  logout: async () => {
    const s = session;
    await setSession(null);
    if (s) await request('POST', '/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
  },
  deleteAccount: async (password: string) => {
    await request('DELETE', '/account', { password });
    await setSession(null);
  },
  base: () => request<BaseView>('GET', '/base'),
  rename: (name: string) => request('PATCH', '/base', { name }),
  build: (type: BuildingType) => request<BuildJob>('POST', '/base/build', { type }),
  cancelBuild: (id: string) => request('DELETE', `/base/build/${id}`),
  train: (unit: UnitKey, qty: number) => request<TrainJob>('POST', '/base/train', { unit, qty }),
  cancelTraining: (id: string) => request('DELETE', `/base/train/${id}`),
  nearby: () => request<NearbyView>('GET', '/map/nearby'),
  launch: (target: { kind: 'base' | 'nest'; id: string }, mission: 'raid' | 'scout', units: Army) =>
    request<{ id: string; arrivesAt: number }>('POST', '/armies', { target, mission, units }),
  recall: (id: string) => request<{ returnsAt: number }>('POST', `/armies/${id}/recall`),
  tutorialClaim: (shared = false) => request<{ step: number; reward: Resources }>('POST', '/tutorial/claim', { shared }),
  tutorialRush: () => request<{ kind: 'training' | 'march' }>('POST', '/tutorial/rush'),
  tutorialSkip: () => request<{ step: number }>('POST', '/tutorial/skip'),
  reports: () => request<ReportSummary[]>('GET', '/reports'),
  report: (id: string) => request<ReportDetail>('GET', `/reports/${id}`),
  registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') => request('POST', '/push-tokens', { token, platform }),

  friends: () => request<FriendsView>('GET', '/friends'),
  addFriend: (nameOrCode: string) => {
    const v = nameOrCode.trim();
    const isCode = /^rf-?[a-z0-9]{5}$/i.test(v);
    return request<{ status: 'requested' | 'friends'; username: string }>('POST', '/friends/requests', isCode ? { code: v } : { username: v });
  },
  answerRequest: (id: string, accept: boolean) => request('POST', `/friends/requests/${id}/${accept ? 'accept' : 'decline'}`),
  removeFriend: (userId: string) => request('DELETE', `/friends/${userId}`),
  block: (userId: string) => request('POST', `/blocks/${userId}`),
  reportUser: (userId: string, reason: string, messageId?: string) => request('POST', '/abuse-reports', { userId, reason, messageId }),
  conversations: () => request<ConversationView[]>('GET', '/conversations'),
  thread: (userId: string) => request<ThreadView>('GET', `/messages/${userId}`),
  sendMessage: (userId: string, body: string) => request('POST', `/messages/${userId}`, { body }),
  shareReport: (userId: string, reportId: string) => request('POST', `/messages/${userId}`, { reportId }),
};
