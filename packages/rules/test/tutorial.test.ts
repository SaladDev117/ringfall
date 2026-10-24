import { describe, expect, it } from 'vitest';
import {
  TUTORIAL, TUTORIAL_DONE, TUTORIAL_RUSH, startingLevels, tutorialRushOffered, tutorialStepDone, tutorialStepIndex,
  type TutorialFacts,
} from '../src';

const facts = (o: Partial<TutorialFacts> = {}): TutorialFacts => ({
  levels: startingLevels(), builds: [], training: [], troopers: 5, nestRaids: 0, reportsSeen: 0, friends: 0, ...o,
});
const step = tutorialStepIndex;

describe('tutorial', () => {
  it('has the spec steps, with the Command Center first, each with a reward', () => {
    expect(TUTORIAL.map((s) => s.key)).toEqual(['upgradeCommand', 'trainTroopers', 'raidNest', 'readReport', 'upgradeAlloy', 'shareCode']);
    expect(TUTORIAL_DONE).toBe(6);
    for (const s of TUTORIAL) expect(s.reward.alloy).toBeGreaterThan(0);
  });

  it('counts a step as done once the player has started it', () => {
    expect(tutorialStepDone(step('upgradeCommand'), facts())).toBe(false);
    const cc = { id: 'c', type: 'commandCenter' as const, toLevel: 2, startedAt: 0, endsAt: 1, cost: TUTORIAL[0]!.reward };
    expect(tutorialStepDone(step('upgradeCommand'), facts({ builds: [cc] }))).toBe(true);
    expect(tutorialStepDone(step('upgradeCommand'), facts({ levels: { ...startingLevels(), commandCenter: 2 } }))).toBe(true);

    expect(tutorialStepDone(step('upgradeAlloy'), facts())).toBe(false);
    const upgrading = { id: 'b', type: 'alloyExtractor' as const, toLevel: 2, startedAt: 0, endsAt: 1, cost: TUTORIAL[0]!.reward };
    expect(tutorialStepDone(step('upgradeAlloy'), facts({ builds: [upgrading] }))).toBe(true);
    expect(tutorialStepDone(step('upgradeAlloy'), facts({ levels: { ...startingLevels(), alloyExtractor: 2 } }))).toBe(true);

    expect(tutorialStepDone(step('trainTroopers'), facts())).toBe(false);
    const job = { id: 't', building: 'barracks' as const, unit: 'trooper' as const, qty: 5, done: 0, unitMs: 1, startsAt: 0 };
    expect(tutorialStepDone(step('trainTroopers'), facts({ training: [job] }))).toBe(true);
    expect(tutorialStepDone(step('trainTroopers'), facts({ troopers: 10 }))).toBe(true);

    expect(tutorialStepDone(step('raidNest'), facts({ nestRaids: 1 }))).toBe(true);
    expect(tutorialStepDone(step('readReport'), facts({ nestRaids: 1 }))).toBe(false);
    expect(tutorialStepDone(step('readReport'), facts({ reportsSeen: 1 }))).toBe(true);
    expect(tutorialStepDone(step('shareCode'), facts())).toBe(false);
    expect(tutorialStepDone(step('shareCode'), facts({ shared: true }))).toBe(true);
    expect(tutorialStepDone(step('shareCode'), facts({ friends: 1 }))).toBe(true);
    expect(tutorialStepDone(TUTORIAL_DONE, facts({ friends: 1 }))).toBe(false);
  });

  it('offers each free speed-up once, and only while it still helps', () => {
    expect(tutorialRushOffered('training', step('trainTroopers'), 0)).toBe(true);
    expect(tutorialRushOffered('training', step('raidNest'), 0)).toBe(true);
    expect(tutorialRushOffered('training', step('readReport'), 0)).toBe(false);
    expect(tutorialRushOffered('training', step('raidNest'), TUTORIAL_RUSH.training)).toBe(false);
    expect(tutorialRushOffered('march', step('readReport'), TUTORIAL_RUSH.training)).toBe(true);
    expect(tutorialRushOffered('march', step('shareCode'), 0)).toBe(false);
    expect(tutorialRushOffered('march', step('readReport'), TUTORIAL_RUSH.march)).toBe(false);
  });
});
