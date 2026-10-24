import type { BuildingLevels } from './buildings';
import { res, type Resources } from './resources';
import type { BuildJob, TrainJob } from './settle';

export type TutorialStepKey = 'upgradeCommand' | 'trainTroopers' | 'raidNest' | 'readReport' | 'upgradeAlloy' | 'shareCode';

export interface TutorialStep {
  key: TutorialStepKey;
  title: string;
  /** What to do and why, in a sentence or two. */
  body: string;
  /** Paid into the base when the player claims the finished step. */
  reward: Resources;
}

/**
 * The first-session steps from the spec, plus the Command Center upgrade the Alloy Extractor needs first. They're
 * ordered so its 3-minute build runs while the player trains, raids and watches the battle. Rewards add up to
 * roughly the starting resources again.
 */
export const TUTORIAL: readonly TutorialStep[] = [
  {
    key: 'upgradeCommand',
    title: 'Upgrade the Command Center',
    body: 'Welcome to the Ring, Commander. The Command Center is the heart of your outpost, and nothing can be built higher than it. Upgrade it to level 2.',
    reward: res(150, 100),
  },
  {
    key: 'trainTroopers',
    title: 'Train 5 Troopers',
    body: 'Troopers are your basic infantry. Open the Barracks and train 5 more. Training takes time: 3 minutes each.',
    reward: res(200, 100),
  },
  {
    key: 'raidNest',
    title: 'Raid a Blight Nest',
    body: 'The Blight has dug in right next to you. Send 10 Troopers to the level 1 nest. Clear it and they bring its loot home.',
    reward: res(200, 100),
  },
  {
    key: 'readReport',
    title: 'Watch the battle',
    body: 'When your army reaches the nest the fight plays out and a battle report comes in. Open it to watch the replay.',
    reward: res(250, 150),
  },
  {
    key: 'upgradeAlloy',
    title: 'Upgrade the Alloy Extractor',
    body: 'Alloy builds everything. With the Command Center at level 2, upgrade your Alloy Extractor to mine more of it.',
    reward: res(100, 50),
  },
  {
    key: 'shareCode',
    title: 'Bring a friend',
    body: 'Ringfall is better with friends. Share your invite code: friends who sign up with it land in your sector.',
    reward: res(250, 200, 20),
  },
];

/** `tutorialStep` once every step is claimed, or the tutorial was skipped. */
export const TUTORIAL_DONE = TUTORIAL.length;

export const tutorialStepIndex = (key: TutorialStepKey): number => TUTORIAL.findIndex((s) => s.key === key);

/** What the server knows about a player when it checks a step. */
export interface TutorialFacts {
  levels: BuildingLevels;
  builds: readonly BuildJob[];
  training: readonly TrainJob[];
  /** Troopers at home and away. */
  troopers: number;
  /** Raids the player has ever sent at a Blight Nest. */
  nestRaids: number;
  /** Battle or scout reports the player has opened. */
  reportsSeen: number;
  /** Friends, plus friend requests the player has sent. */
  friends: number;
  /** The player shared their invite code from the app (taken on trust). */
  shared?: boolean;
}

/** Whether the player has done what `step` asks. Steps count as done once started, so nobody waits to claim. */
export function tutorialStepDone(step: number, f: TutorialFacts): boolean {
  switch (TUTORIAL[step]?.key) {
    case 'upgradeCommand': return f.levels.commandCenter >= 2 || f.builds.some((b) => b.type === 'commandCenter');
    case 'trainTroopers': return f.training.some((t) => t.unit === 'trooper') || f.troopers >= 10;
    case 'raidNest': return f.nestRaids > 0;
    case 'readReport': return f.reportsSeen > 0;
    case 'upgradeAlloy': return f.levels.alloyExtractor >= 2 || f.builds.some((b) => b.type === 'alloyExtractor');
    case 'shareCode': return f.friends > 0 || !!f.shared;
    default: return false;
  }
}

/**
 * The tutorial's free speed-ups, each usable once (stored as bit flags): finishing the first Trooper batch,
 * and marching the first raid straight to its nest. They keep a new player's first battle minutes away.
 */
export const TUTORIAL_RUSH = { training: 1, march: 2 } as const;
export type TutorialRushKind = keyof typeof TUTORIAL_RUSH;

/** Biggest Trooper batch the tutorial finishes for free. */
export const TUTORIAL_RUSH_MAX_TROOPERS = 10;

/** The free speed-up on offer at `step`, if it hasn't been used. The march is only offered until the report is read. */
export function tutorialRushOffered(kind: TutorialRushKind, step: number, used: number): boolean {
  if (used & TUTORIAL_RUSH[kind]) return false;
  const last = kind === 'training' ? tutorialStepIndex('raidNest') : tutorialStepIndex('readReport');
  return step <= last;
}
