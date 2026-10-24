import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, register, setupTestApp, type TestApp } from './helpers.js';

const MIN = 60_000;

describe.skipIf(!TEST_DATABASE_URL)('tutorial (needs TEST_DATABASE_URL)', () => {
  let t: TestApp;
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    t = await setupTestApp();
  });
  afterAll(async () => t?.close());

  it('walks a new commander through all five steps, paying each reward once', async () => {
    const p = await register(t.app, 'tutee');
    const tutorial = async () => (await p.get('/base')).body.tutorial;

    expect(await tutorial()).toEqual({ step: 0, done: false, rush: null, nest: null, reportId: null });
    expect((await p.post('/tutorial/claim')).body.error).toBe('tutorial_step_not_done');

    // 1. Upgrade the Command Center: done as soon as the upgrade starts.
    expect((await p.post('/base/build', { type: 'commandCenter' })).status).toBe(200);
    expect((await tutorial()).done).toBe(true);
    const before = (await p.get('/base')).body.resources.alloy;
    const claim1 = await p.post('/tutorial/claim');
    expect(claim1.body).toEqual({ step: 1, reward: { alloy: 150, plasma: 100, relics: 0 } });
    expect((await p.get('/base')).body.resources.alloy - before).toBeGreaterThanOrEqual(150);
    expect((await p.post('/tutorial/claim')).status).toBe(409); // no double claims

    // 2. Train 5 Troopers.
    expect((await p.post('/base/train', { unit: 'trooper', qty: 5 })).status).toBe(200);
    expect((await p.post('/tutorial/claim')).body.step).toBe(2);

    // 3. Raid a nest. The free speed-up finishes the Troopers so the raid can go now.
    const raidStep = await tutorial();
    expect(raidStep).toMatchObject({ step: 2, done: false, rush: { kind: 'training' }, nest: { level: 1 } });
    expect((await p.post('/tutorial/rush')).body).toEqual({ kind: 'training' });
    const trained = (await p.get('/base')).body;
    expect(trained.units.trooper).toBe(10);
    expect(trained.training).toEqual([]);
    expect(trained.tutorial.rush).toBeNull();

    const launch = await p.post('/armies', { target: { kind: 'nest', id: raidStep.nest.id }, mission: 'raid', units: { trooper: 10 } });
    expect(launch.status).toBe(201);
    expect((await p.get('/base')).body.armies[0].targetKind).toBe('nest');
    expect((await p.post('/tutorial/claim')).body.step).toBe(3);

    // 4. Watch the battle. The second speed-up marches the army straight there; the report needs opening.
    expect((await tutorial()).rush).toMatchObject({ kind: 'march', at: launch.body.arrivesAt });
    expect((await p.post('/tutorial/claim')).body.error).toBe('tutorial_step_not_done');
    expect((await p.post('/tutorial/rush')).body).toEqual({ kind: 'march' });
    const arrived = await tutorial();
    expect(arrived).toMatchObject({ step: 3, done: false, rush: null });
    expect(arrived.reportId).toEqual(expect.any(String));
    expect((await p.post('/tutorial/rush')).body.error).toBe('nothing_to_rush');
    expect((await p.get(`/reports/${arrived.reportId}`)).status).toBe(200);
    expect((await tutorial()).done).toBe(true);
    expect((await p.post('/tutorial/claim')).body.step).toBe(4);

    // 5. Upgrade the Alloy Extractor, once the Command Center has reached level 2.
    expect((await p.post('/base/build', { type: 'alloyExtractor' })).body.error).toBe('needs_command_center');
    await t.advance(3 * MIN);
    expect((await p.post('/base/build', { type: 'alloyExtractor' })).status).toBe(200);
    expect((await p.post('/tutorial/claim')).body).toEqual({ step: 5, reward: { alloy: 100, plasma: 50, relics: 0 } });

    // 6. Share the invite code.
    expect((await p.post('/tutorial/claim', { shared: false })).body.error).toBe('tutorial_step_not_done');
    expect((await p.post('/tutorial/claim', { shared: true })).body).toEqual({ step: 6, reward: { alloy: 250, plasma: 200, relics: 20 } });
    expect(await tutorial()).toBeNull();
    expect((await p.post('/tutorial/claim', { shared: true })).body.error).toBe('tutorial_finished');
  });

  it('counts a friend request as bringing a friend, and can be skipped', async () => {
    const a = await register(t.app, 'tut_friend_a');
    await register(t.app, 'tut_friend_b');
    await t.sql(`update users set tutorial_step = 5 where username = 'tut_friend_a'`);
    expect((await a.get('/base')).body.tutorial).toMatchObject({ step: 5, done: false });
    expect((await a.post('/friends/requests', { username: 'tut_friend_b' })).status).toBe(200);
    expect((await a.get('/base')).body.tutorial.done).toBe(true);

    const skipper = await register(t.app, 'tut_skipper');
    expect((await skipper.post('/tutorial/skip')).body).toEqual({ step: 6 });
    expect((await skipper.get('/base')).body.tutorial).toBeNull();
    expect((await skipper.post('/tutorial/rush')).body.error).toBe('nothing_to_rush');
  });

  it('only rushes small Trooper batches, once', async () => {
    const p = await register(t.app, 'tut_rusher');
    await t.sql(`update users set tutorial_step = 1 where username = 'tut_rusher'`);
    await p.post('/base/train', { unit: 'trooper', qty: 11 });
    expect((await p.get('/base')).body.tutorial.rush).toBeNull();
    expect((await p.post('/tutorial/rush')).body.error).toBe('nothing_to_rush');
    const job = (await p.get('/base')).body.training[0];
    await p.del(`/base/train/${job.id}`);
    await p.post('/base/train', { unit: 'trooper', qty: 3 });
    expect((await p.post('/tutorial/rush')).status).toBe(200);
    await p.post('/base/train', { unit: 'trooper', qty: 3 });
    expect((await p.post('/tutorial/rush')).body.error).toBe('nothing_to_rush');
  });
});
