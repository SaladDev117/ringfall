import type { Army, BattleResult, BuildJob, BuildingLevels, Resources, TrainJob } from '@ringfall/rules';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  inviteCode: text('invite_code').notNull(),
  recoveryEmail: text('recovery_email'),
  /** Updated at most every few minutes, for "last seen" on friends lists. */
  lastSeenAt: ts('last_seen_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`),
  uniqueIndex('users_invite_code_idx').on(t.inviteCode),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)]);

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  status: text('status').$type<'active' | 'ended'>().notNull().default('active'),
}, (t) => [uniqueIndex('seasons_one_active_idx').on(t.status).where(sql`status = 'active'`)]);

/** One base per player per season. The columns from `resources` to `training` are the rules engine's BaseState. */
export const bases = pgTable('bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  sector: integer('sector').notNull(),
  resources: jsonb('resources').$type<Resources>().notNull(),
  resourcesAt: ts('resources_at').notNull(),
  levels: jsonb('levels').$type<BuildingLevels>().notNull(),
  units: jsonb('units').$type<Army>().notNull(),
  builds: jsonb('builds').$type<BuildJob[]>().notNull().default([]),
  training: jsonb('training').$type<TrainJob[]>().notNull().default([]),
  joinedAt: ts('joined_at').notNull(),
  seasonDayAtJoin: integer('season_day_at_join').notNull().default(0),
  protectionBroken: boolean('protection_broken').notNull().default(false),
  shieldUntil: ts('shield_until'),
  power: integer('power').notNull().default(0),
  /** Earliest build or training completion, so the worker can settle bases and send pushes. */
  nextEventAt: ts('next_event_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('bases_season_user_idx').on(t.seasonId, t.userId),
  uniqueIndex('bases_season_xy_idx').on(t.seasonId, t.x, t.y),
  index('bases_season_sector_idx').on(t.seasonId, t.sector),
  index('bases_next_event_idx').on(t.nextEventAt),
]);

export const nests = pgTable('nests', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  sector: integer('sector').notNull(),
  level: integer('level').notNull(),
  garrison: jsonb('garrison').$type<Army>().notNull(),
  garrisonAt: ts('garrison_at').notNull(),
  /** Respawned nests stay hidden until this time. */
  activeAt: ts('active_at').notNull(),
  clearedAt: ts('cleared_at'),
}, (t) => [index('nests_season_sector_idx').on(t.seasonId, t.sector)]);

export type ArmyMission = 'raid' | 'scout';
export type ArmyStatus = 'outbound' | 'returning' | 'done';

export const armies = pgTable('armies', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  ownerBaseId: uuid('owner_base_id').notNull().references(() => bases.id, { onDelete: 'cascade' }),
  targetBaseId: uuid('target_base_id').references(() => bases.id, { onDelete: 'set null' }),
  targetNestId: uuid('target_nest_id').references(() => nests.id, { onDelete: 'set null' }),
  mission: text('mission').$type<ArmyMission>().notNull(),
  /** Units sent. */
  units: jsonb('units').$type<Army>().notNull(),
  /** Units heading home after the arrival. */
  survivors: jsonb('survivors').$type<Army>(),
  loot: jsonb('loot').$type<Resources>().notNull().default({ alloy: 0, plasma: 0, relics: 0 }),
  originX: integer('origin_x').notNull(),
  originY: integer('origin_y').notNull(),
  targetX: integer('target_x').notNull(),
  targetY: integer('target_y').notNull(),
  departsAt: ts('departs_at').notNull(),
  arrivesAt: ts('arrives_at').notNull(),
  returnsAt: ts('returns_at'),
  status: text('status').$type<ArmyStatus>().notNull().default('outbound'),
  recalledAt: ts('recalled_at'),
  reportId: uuid('report_id'),
}, (t) => [
  index('armies_status_arrives_idx').on(t.status, t.arrivesAt),
  index('armies_owner_status_idx').on(t.ownerBaseId, t.status),
  index('armies_target_status_idx').on(t.targetBaseId, t.status),
]);

export type ReportKind = 'raid' | 'scout' | 'nest';

/** Everything needed to show a report, frozen at the time of the battle. */
export interface ReportData {
  attackerName: string;
  defenderName: string;
  targetName: string;
  coords: string;
  battle?: BattleResult;
  loot?: Resources;
  carry?: number;
  repaired?: Army;
  salvage?: number;
  /** Scout missions. */
  intel?: { resources: Resources; units: Army; levels: BuildingLevels } | null;
  /** The army turned back without a fight (shielded base, cleared nest). */
  bounced?: 'shielded' | 'nest_cleared';
}

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  kind: text('kind').$type<ReportKind>().notNull(),
  at: ts('at').notNull(),
  outcome: text('outcome').notNull(),
  attackerUserId: uuid('attacker_user_id').references(() => users.id, { onDelete: 'set null' }),
  defenderUserId: uuid('defender_user_id').references(() => users.id, { onDelete: 'set null' }),
  data: jsonb('data').$type<ReportData>().notNull(),
  attackerSeen: boolean('attacker_seen').notNull().default(false),
  defenderSeen: boolean('defender_seen').notNull().default(false),
}, (t) => [
  index('reports_attacker_idx').on(t.attackerUserId, t.at),
  index('reports_defender_idx').on(t.defenderUserId, t.at),
]);

export type NotificationKind = 'build_done' | 'train_done' | 'incoming_attack' | 'friend_request' | 'message';

/** Outbox for push notifications: written in the same transaction as the event, sent by the worker. */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<NotificationKind>().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** What it's about (e.g. an army id), so it can be withdrawn if that changes. */
  ref: text('ref'),
  /** Don't send before this (incoming-attack warnings without a Sensor Array). */
  sendAt: ts('send_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('notifications_pending_idx').on(t.sentAt, t.sendAt)]);

export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('push_tokens_user_idx').on(t.userId)]);

// ── Social ────────────────────────────────────────────────────────────────────

const userRef = (name: string) => uuid(name).notNull().references(() => users.id, { onDelete: 'cascade' });

/** Stored once per pair, with `userA < userB`. */
export const friendships = pgTable('friendships', {
  userA: userRef('user_a'),
  userB: userRef('user_b'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userA, t.userB] }), index('friendships_b_idx').on(t.userB)]);

export const friendRequests = pgTable('friend_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUser: userRef('from_user'),
  toUser: userRef('to_user'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('friend_requests_pair_idx').on(t.fromUser, t.toUser), index('friend_requests_to_idx').on(t.toUser)]);

export const blocks = pgTable('blocks', {
  blocker: userRef('blocker'),
  blocked: userRef('blocked'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blocker, t.blocked] })]);

/** One conversation per pair of friends, `userA < userB`. */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userA: userRef('user_a'),
  userB: userRef('user_b'),
  lastMessageAt: ts('last_message_at').notNull().defaultNow(),
  readA: ts('read_a').notNull().defaultNow(),
  readB: ts('read_b').notNull().defaultNow(),
}, (t) => [uniqueIndex('conversations_pair_idx').on(t.userA, t.userB), index('conversations_b_idx').on(t.userB)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: userRef('sender_id'),
  body: text('body').notNull(),
  /** A shared battle or scout report. */
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
  /** The word filter changed something. */
  flagged: boolean('flagged').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)]);

export const abuseReports = pgTable('abuse_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: userRef('reporter_id'),
  targetUserId: userRef('target_user_id'),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  status: text('status').$type<'open' | 'actioned' | 'dismissed'>().notNull().default('open'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('abuse_reports_status_idx').on(t.status, t.createdAt)]);
