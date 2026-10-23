import type { Defenses } from '../combat';
import { nestGarrison } from '../nests';
import type { Army, CombatantKey } from '../units';

const UNIT_ALIASES: Record<string, CombatantKey> = {
  wisp: 'wisp', drone: 'wisp',
  trooper: 'trooper',
  breacher: 'breacher',
  rattler: 'rattler', buggy: 'rattler',
  mule: 'mule', hauler: 'mule',
  bulwark: 'bulwark', tank: 'bulwark',
  kestrel: 'kestrel', gunship: 'kestrel',
  hammerfall: 'hammerfall', walker: 'hammerfall',
  titan: 'titan',
  crawler: 'crawler', spitter: 'spitter', brute: 'brute',
};

const DEFENSE_ALIASES: Record<string, keyof Defenses | 'repair'> = {
  sentry: 'sentryTurret', rail: 'railTurret', flak: 'flakTurret',
  wall: 'perimeterWall', shield: 'shieldGenerator', repair: 'repair',
};

export interface ParsedSide {
  army: Army;
  defenses: Defenses;
  repairBay: number;
  nestLevel?: number;
}

const singular = (word: string): string => (word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.replace(/e?s$/, ''));

function unitKey(word: string): CombatantKey {
  const w = word.toLowerCase();
  const key = UNIT_ALIASES[w] ?? UNIT_ALIASES[singular(w)] ?? UNIT_ALIASES[w.replace(/s$/, '')];
  if (!key) throw new Error(`Unknown unit "${word}"`);
  return key;
}

/**
 * Parses one side of a matchup, e.g. `"40 trooper, 10 rattlers, sentry:2, wall:1"` or `"nest:5"`.
 * Units are `<count> <name>`, structures are `<name>:<level>`.
 */
export function parseSide(text: string): ParsedSide {
  const side: ParsedSide = { army: {}, defenses: {}, repairBay: 0 };
  for (const raw of text.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const structure = token.match(/^([a-z]+)\s*:\s*(\d+)$/i);
    if (structure) {
      const [, name, levelText] = structure as unknown as [string, string, string];
      const level = Number(levelText);
      if (name.toLowerCase() === 'nest') {
        side.nestLevel = level;
        for (const [k, n] of Object.entries(nestGarrison(level)) as [CombatantKey, number][]) {
          side.army[k] = (side.army[k] ?? 0) + n;
        }
        continue;
      }
      const key = DEFENSE_ALIASES[name.toLowerCase()];
      if (!key) throw new Error(`Unknown structure "${name}"`);
      if (key === 'repair') side.repairBay = level;
      else side.defenses[key] = level;
      continue;
    }
    const unit = token.match(/^(\d+)\s*x?\s+([a-z ]+)$/i);
    if (!unit) throw new Error(`Can't read "${token}". Use "10 trooper" or "wall:2"`);
    const [, countText, name] = unit as unknown as [string, string, string];
    const key = unitKey(name.trim().split(/\s+/)[0]!);
    side.army[key] = (side.army[key] ?? 0) + Number(countText);
  }
  return side;
}
