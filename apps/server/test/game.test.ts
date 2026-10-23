import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, client, register, setupTestApp, type Player, type TestApp } from './helpers.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe.skipIf(!TEST_DATABASE_URL)('game server (needs TEST_DATABASE_URL)', () => {
  let t: TestApp;
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    t = await setupTestApp();
  });
  afterAll(async () => t?.close());

  describe('accounts', () => {
    it('registers, logs in, refreshes and rejects bad input', async () => {
      const anon = client(t.app);
      const alice = await register(t.app, 'alice_acc');
      expect(alice.user.inviteCode).toMatch(/^RF-[A-Z0-9]{5}$/);

      expect((await anon.post('/auth/register', { username: 'ALICE_ACC', password: 'something long' })).status).toBe(409);
      expect((await anon.post('/auth/register', { username: 'x', password: 'something long' })).body.error).toBe('bad_username');
      expect((await anon.post('/auth/register', { username: 'okname', password: 'short' })).status).toBe(400);
      expect((await anon.post('/auth/register', { username: 'okname2', password: 'long enough', inviteCode: 'RF-ZZZZZ' })).body.error)
        .toBe('bad_invite_code');

      expect((await anon.post('/auth/login', { username: 'alice_acc', password: 'wrong password' })).status).toBe(401);
      const login = await anon.post('/auth/login', { username: 'Alice_Acc', password: 'correct horse' });
      expect(login.status).toBe(200);

      const r1 = await anon.post('/auth/refresh', { refreshToken: login.body.refreshToken });
      expect(r1.status).toBe(200);
      expect((await anon.post('/auth/refresh', { refreshToken: login.body.refreshToken })).status).toBe(401); // rotated
      expect((await client(t.app, r1.body.accessToken).get('/me')).body.username).toBe('alice_acc');
      expect((await anon.get('/base')).status).toBe(401);
    });

    it('deletes an account with the right password', async () => {
      const gone = await register(t.app, 'leaver');
      expect((await gone.del('/account', { password: 'nope nope' })).status).toBe(401);
      expect((await gone.del('/account', { password: 'correct horse' })).status).toBe(200);
      expect((await client(t.app).post('/auth/login', { username: 'leaver', password: 'correct horse' })).status).toBe(401);
    });
  });

  describe('base, building and training', () => {
    let p: Player;
    beforeAll(async () => {
      p = await register(t.app, 'builder');
    });

    it('starts with the spec starting base', async () => {
      const { status, body } = await p.get('/base');
      expect(status).toBe(200);
      expect(body.units).toEqual({ trooper: 5 });
      expect(body.levels.commandCenter).toBe(1);
      expect(Math.round(body.resources.alloy)).toBeGreaterThanOrEqual(1000);
      expect(body.protectionUntil).toBeGreaterThan(Date.now());
      expect(body.coords).toMatch(/^S\d+ · \d+, \d+$/);
      expect(body.name).toBe("builder's Outpost");
    });

    it('upgrades, cancels with a refund, and finishes over time', async () => {
      expect((await p.post('/base/build', { type: 'alloyExtractor' })).body.error).toBe('needs_command_center');
      const before = (await p.get('/base')).body.resources.alloy;
      const job = await p.post('/base/build', { type: 'commandCenter' });
      expect(job.status).toBe(200);
      expect((await p.post('/base/build', { type: 'commandCenter' })).body.error).toBe('already_upgrading');
      expect((await p.del(`/base/build/${job.body.id}`)).status).toBe(200);
      expect((await p.get('/base')).body.resources.alloy).toBeGreaterThanOrEqual(before);

      await p.post('/base/build', { type: 'commandCenter' });
      await t.advance(3 * MIN);
      const base = (await p.get('/base')).body;
      expect(base.levels.commandCenter).toBe(2);
      expect(base.builds).toEqual([]);
      const notes = await t.sql("select title from notifications where kind = 'build_done'");
      expect(notes.length).toBeGreaterThan(0);
    });

    it('trains troops in order and adds them as they finish', async () => {
      const job = await p.post('/base/train', { unit: 'trooper', qty: 5 });
      expect(job.status).toBe(200);
      expect((await p.post('/base/train', { unit: 'rattler', qty: 1 })).body.error).toBe('missing_building');
      await t.advance(7 * MIN);
      expect((await p.get('/base')).body.units.trooper).toBe(7);
      await t.advance(10 * MIN);
      const base = (await p.get('/base')).body;
      expect(base.units.trooper).toBe(10);
      expect(base.training).toEqual([]);
    });

    it('renames the base', async () => {
      expect((await p.patch('/base', { name: 'Iron Hollow' })).status).toBe(200);
      expect((await p.get('/base')).body.name).toBe('Iron Hollow');
    });
  });

  describe('map and war', () => {
    let alice: Player;
    let bob: Player;
    beforeAll(async () => {
      alice = await register(t.app, 'alice');
      bob = await register(t.app, 'bob', alice.user.inviteCode);
    });

    it('spawns friends near each other, with nests around', async () => {
      const map = (await alice.get('/map/nearby')).body;
      const bobsBase = map.places.find((p: any) => p.owner === 'bob');
      expect(bobsBase).toBeTruthy();
      expect(bobsBase.distance).toBeLessThanOrEqual(15);
      expect(map.places.some((p: any) => p.kind === 'nest' && p.level === 1)).toBe(true);
      expect(bobsBase.blocked).toBe('target_protected');
    });

    it('clears a Blight Nest and brings the loot home', async () => {
      await alice.post('/base/train', { unit: 'trooper', qty: 15 });
      await t.advance(50 * MIN);
      const map = (await alice.get('/map/nearby')).body;
      const nest = map.places.find((p: any) => p.kind === 'nest' && p.level === 1);
      const launch = await alice.post('/armies', { target: { kind: 'nest', id: nest.id }, mission: 'raid', units: { trooper: 20 } });
      expect(launch.status).toBe(201);
      let base = (await alice.get('/base')).body;
      expect(base.units.trooper ?? 0).toBe(0);
      expect(base.armies).toHaveLength(1);
      expect(base.armies[0].status).toBe('outbound');

      await t.advance(launch.body.arrivesAt - Date.now() + 1000);
      base = (await alice.get('/base')).body;
      expect(base.armies[0].status).toBe('returning');
      const reports = (await alice.get('/reports')).body;
      expect(reports[0].kind).toBe('nest');
      expect(reports[0].title).toBe('Victory at Blight Nest L1');
      const report = (await alice.get(`/reports/${reports[0].id}`)).body;
      expect(report.text).toContain('VICTORY');
      expect(report.data.loot.alloy + report.data.loot.plasma).toBeGreaterThan(0);

      const alloyBefore = base.resources.alloy;
      await t.advance(base.armies[0].returnsAt - Date.now() + 1000);
      base = (await alice.get('/base')).body;
      expect(base.armies).toHaveLength(0);
      expect(base.units.trooper).toBeGreaterThan(10);
      expect(base.resources.alloy).toBeGreaterThan(alloyBefore + report.data.loot.alloy - 1);
      // The cleared nest is gone from the map and a replacement is on its way.
      const after = (await alice.get('/map/nearby')).body;
      expect(after.places.some((p: any) => p.id === nest.id)).toBe(false);
    });

    it('protects new players, then lets them raid each other', async () => {
      const bobBaseId = (await bob.get('/base')).body.id;
      const aliceBaseId = (await alice.get('/base')).body.id;
      const blocked = await bob.post('/armies', { target: { kind: 'base', id: aliceBaseId }, mission: 'raid', units: { trooper: 5 } });
      expect(blocked.body.error).toBe('target_protected');

      await t.advance(73 * HOUR);
      const raid = await alice.post('/armies', { target: { kind: 'base', id: bobBaseId }, mission: 'raid', units: { trooper: 15 } });
      expect(raid.status).toBe(201);

      // Bob has no Sensor Array, so he only sees it coming in the last 10 minutes.
      expect((await bob.get('/base')).body.incoming).toEqual([]);
      await t.advance(raid.body.arrivesAt - Date.now() - 5 * MIN);
      const warned = (await bob.get('/base')).body.incoming;
      expect(warned).toHaveLength(1);
      expect(warned[0].attacker).toBe('alice');
      expect(warned[0].units).toBeNull();

      await t.advance(6 * MIN);
      const bobReports = (await bob.get('/reports')).body;
      expect(bobReports[0].kind).toBe('raid');
      expect(bobReports[0].title).toMatch(/alice/);
      const aliceReports = (await alice.get('/reports')).body;
      const outcome = aliceReports[0].outcome;
      expect(['attacker', 'defender', 'draw']).toContain(outcome);
      const bobBase = (await bob.get('/base')).body;
      if (outcome === 'attacker') expect(bobBase.shieldUntil).toBeGreaterThan(Date.now());
    });

    it('scouts with Wisp Drones', async () => {
      await t.sql(`update bases set units = units || '{"wisp": 3}'::jsonb where name = 'alice''s Outpost'`);
      const bobBaseId = (await bob.get('/base')).body.id;
      const scout = await alice.post('/armies', { target: { kind: 'base', id: bobBaseId }, mission: 'scout', units: { wisp: 3 } });
      expect(scout.status).toBe(201);
      expect((await alice.post('/armies', { target: { kind: 'base', id: bobBaseId }, mission: 'scout', units: { trooper: 1 } })).body.error)
        .toBe('scouts_only_wisps');
      await t.advance(scout.body.arrivesAt - Date.now() + 1000);
      const reports = (await alice.get('/reports')).body;
      const scoutReport = reports.find((r: any) => r.kind === 'scout');
      expect(scoutReport.outcome).toBe('success');
      const full = (await alice.get(`/reports/${scoutReport.id}`)).body;
      expect(full.text).toContain('UNITS AT HOME');
      expect(full.data.intel.levels.commandCenter).toBe(1);
    });

    it('recalls an army before it arrives', async () => {
      await t.advance(3 * HOUR); // let the raid and scouts get home: CC 1 allows 2 armies out
      const nest = (await alice.get('/map/nearby')).body.places.find((p: any) => p.kind === 'nest');
      const home = (await alice.get('/base')).body.units.trooper;
      const launch = await alice.post('/armies', { target: { kind: 'nest', id: nest.id }, mission: 'raid', units: { trooper: 2 } });
      expect(launch.body).toMatchObject({ arrivesAt: expect.any(Number) });
      await t.advance(1 * MIN);
      const recall = await alice.post(`/armies/${launch.body.id}/recall`);
      expect(recall.status).toBe(200);
      await t.advance(2 * MIN);
      expect((await alice.get('/base')).body.units.trooper).toBe(home);
    });
  });

  describe('friends and messages', () => {
    let carol: Player;
    let dave: Player;
    let erin: Player;
    beforeAll(async () => {
      carol = await register(t.app, 'carol');
      dave = await register(t.app, 'dave', carol.user.inviteCode);
      erin = await register(t.app, 'erin');
    });

    it('signing up with an invite code sends the inviter a friend request', async () => {
      const list = (await carol.get('/friends')).body;
      expect(list.incoming).toHaveLength(1);
      expect(list.incoming[0].username).toBe('dave');
      expect((await carol.get('/base')).body.social.friendRequests).toBe(1);
      expect((await carol.post(`/friends/requests/${list.incoming[0].id}/accept`)).body.status).toBe('friends');
      const friends = (await dave.get('/friends')).body.friends;
      expect(friends.map((f: any) => f.username)).toEqual(['carol']);
      expect(friends[0].base.coords).toMatch(/^S\d+/);
    });

    it('requests by username can be declined, and mutual requests become friendships', async () => {
      expect((await erin.post('/friends/requests', { username: 'CAROL' })).body.status).toBe('requested');
      const req = (await carol.get('/friends')).body.incoming[0];
      expect((await carol.post(`/friends/requests/${req.id}/decline`)).body.status).toBe('declined');
      expect((await erin.post('/friends/requests', { username: 'nobody_here' })).status).toBe(404);
      expect((await erin.post('/friends/requests', { username: 'erin' })).body.error).toBe('cannot_friend_self');
      expect((await carol.post('/friends/requests', { username: 'dave' })).body.error).toBe('already_friends');

      expect((await erin.post('/friends/requests', { username: 'dave' })).body.status).toBe('requested');
      expect((await dave.post('/friends/requests', { code: erin.user.inviteCode })).body.status).toBe('friends');
    });

    it('friends can message each other, with unread counts and a word filter', async () => {
      expect((await dave.post(`/messages/${carol.user.id}`, { body: 'hello neighbour' })).status).toBe(201);
      expect((await dave.post(`/messages/${carol.user.id}`, { body: 'you fucking noob' })).body.body).toBe('you ******* noob');
      const convos = (await carol.get('/conversations')).body;
      expect(convos[0]).toMatchObject({ username: 'dave', unread: 2, preview: 'you ******* noob' });
      expect((await carol.get('/base')).body.social.unreadMessages).toBe(2);
      const thread = (await carol.get(`/messages/${dave.user.id}`)).body;
      expect(thread.messages.map((m: any) => m.body)).toEqual(['you ******* noob', 'hello neighbour']);
      expect((await carol.get('/conversations')).body[0].unread).toBe(0);
      expect((await erin.post(`/messages/${carol.user.id}`, { body: 'hi' })).body.error).toBe('not_friends');
      expect((await dave.post(`/messages/${carol.user.id}`, { body: '   ' })).body.error).toBe('empty_message');
    });

    it('shares a battle report with a friend', async () => {
      const nest = (await dave.get('/map/nearby')).body.places.find((p: any) => p.kind === 'nest');
      const launch = await dave.post('/armies', { target: { kind: 'nest', id: nest.id }, mission: 'raid', units: { trooper: 5 } });
      await t.advance(launch.body.arrivesAt - Date.now() + 1000);
      const report = (await dave.get('/reports')).body[0];
      expect((await carol.get(`/reports/${report.id}`)).status).toBe(404);
      expect((await dave.post(`/messages/${carol.user.id}`, { reportId: report.id })).status).toBe(201);
      const thread = (await carol.get(`/messages/${dave.user.id}`)).body;
      expect(thread.messages[0].report.id).toBe(report.id);
      const shared = (await carol.get(`/reports/${report.id}`)).body;
      expect(shared.shared).toBe(true);
      expect(shared.text).toContain('RAID ON BLIGHT NEST');
      expect((await erin.get(`/reports/${report.id}`)).status).toBe(404);
    });

    it('blocking ends the friendship and stops requests and messages', async () => {
      expect((await carol.post(`/blocks/${dave.user.id}`)).status).toBe(200);
      expect((await dave.get('/friends')).body.friends.map((f: any) => f.username)).toEqual(['erin']);
      expect((await dave.post('/friends/requests', { username: 'carol' })).body.error).toBe('cannot_add');
      expect((await dave.post(`/messages/${carol.user.id}`, { body: 'hey?' })).body.error).toBe('not_friends');
      expect((await carol.post('/abuse-reports', { userId: dave.user.id, reason: 'spam' })).status).toBe(200);
      expect((await carol.get('/blocks')).body.map((b: any) => b.username)).toEqual(['dave']);
    });
  });
});
