import { BUILDINGS, TURRET_TYPES } from './buildings';
import type { BattleResult, Losses, StackKey } from './combat';
import { RESOURCES, type Resources } from './resources';
import { COMBATANT_KEYS, COMBATANTS, type Army } from './units';

export interface ReportContext {
  perspective: 'attacker' | 'defender';
  attackerName: string;
  /** Player name, or e.g. "the Blight" for a nest. */
  defenderName: string;
  /** Base or nest name, e.g. "Iron Hollow" or "Blight Nest L4". */
  targetName: string;
  coords?: string;
  when?: string;
  loot?: Resources;
  carry?: number;
  repaired?: Army;
  salvage?: number;
}

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const pad = (s: string, n: number): string => s.padEnd(n);
const padL = (s: string, n: number): string => s.padStart(n);

const stackName = (key: StackKey): string =>
  key in COMBATANTS ? COMBATANTS[key as keyof typeof COMBATANTS].name : BUILDINGS[key as keyof typeof BUILDINGS].name;

function listLosses(losses: Losses): string {
  const parts = (Object.entries(losses) as [StackKey, number][]).map(([k, n]) =>
    k in COMBATANTS ? `${n}× ${stackName(k)}` : `${stackName(k)} (knocked out)`,
  );
  return parts.length ? parts.join(', ') : 'nothing';
}

const LOOT_NAMES: Record<keyof Resources, [string, string]> = {
  alloy: ['Alloy', 'Alloy'],
  plasma: ['Plasma', 'Plasma'],
  relics: ['Relic Shard', 'Relic Shards'],
};

function listResources(r: Resources): string {
  const parts = RESOURCES.filter((k) => r[k] > 0).map((k) => `${fmt(r[k])} ${LOOT_NAMES[k][r[k] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(' · ') : 'nothing';
}

const HEADLINE = {
  attacker: { attacker: 'VICTORY', defender: 'DEFEAT', draw: 'DRAW. Your army pulled back' },
  defender: { attacker: 'RAIDED', defender: 'DEFENDED', draw: 'HELD. The attackers pulled back' },
} as const;

const W_SCOUT = 20;

export interface ScoutReportContext {
  perspective: 'attacker' | 'defender';
  attackerName: string;
  defenderName: string;
  targetName: string;
  coords?: string;
  success: boolean;
  intel: { resources: Resources; units: Army; levels: Partial<Record<keyof typeof BUILDINGS, number>> } | null;
}

/** Plain-text scout report. */
export function formatScoutReport(ctx: ScoutReportContext): string {
  const lines = [...wrap(`🛰 SCOUT REPORT · ${ctx.targetName.toUpperCase()}`, 2), `${ctx.defenderName}${ctx.coords ? ` · ${ctx.coords}` : ''}`, ''];
  if (ctx.perspective === 'defender') {
    lines.push(...wrap(ctx.success
      ? `${ctx.attackerName}'s Wisp Drones slipped past your sensors and scouted your base.`
      : `Your Sensor Array spotted ${ctx.attackerName}'s Wisp Drones and shot them all down.`, 0));
    return lines.join('\n');
  }
  if (!ctx.success || !ctx.intel) {
    lines.push(
      ...wrap('Your Wisp Drones were shot down before they saw anything.', 0),
      '',
      ...wrap('Send more Wisps than twice their Sensor Array level, plus their own Wisps.', 0),
    );
    return lines.join('\n');
  }
  const { resources, units, levels } = ctx.intel;
  lines.push('RESOURCES');
  for (const k of RESOURCES) lines.push(`  ${pad(LOOT_NAMES[k][1], W_SCOUT)}${padL(fmt(resources[k]), 10)}`);
  lines.push('');
  lines.push('UNITS AT HOME');
  const home = COMBATANT_KEYS.filter((k) => units[k]);
  for (const k of home) lines.push(`  ${pad(COMBATANTS[k].name, W_SCOUT)}${padL(fmt(units[k]!), 6)}`);
  if (!home.length) lines.push('  none');
  lines.push('', 'BUILDINGS');
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const level = levels[type as keyof typeof BUILDINGS];
    if (level) lines.push(`  ${pad(def.name, W_SCOUT)}${padL(`L${level}`, 6)}`);
  }
  return lines.join('\n');
}


/** Reports are read on phones: keep lines to about this many monospaced characters. */
export const REPORT_WIDTH = 44;

/** Wraps `text` at word boundaries, keeping its leading indent and indenting continuation lines. */
function wrap(text: string, indent = 4, width = REPORT_WIDTH): string[] {
  const lead = text.match(/^ */)![0];
  const out: string[] = [];
  let line = lead;
  for (const word of text.trimStart().split(' ')) {
    if (line.trim() && (line + ' ' + word).length > width) {
      out.push(line);
      line = ' '.repeat(indent) + word;
    } else {
      line = line.trim() ? `${line} ${word}` : line + word;
    }
  }
  if (line.trim()) out.push(line);
  return out;
}

/** Plain-text battle report, as shown in the Reports inbox. */
export function formatBattleReport(result: BattleResult, ctx: ReportContext): string {
  const mine = ctx.perspective;
  const who = (side: 'attacker' | 'defender') => (side === mine ? 'You' : 'They');
  const lines: string[] = [];
  const W = 20;

  lines.push(...wrap(`⚔ RAID ON ${ctx.targetName.toUpperCase()}`, 2));
  lines.push(`${ctx.defenderName}${ctx.coords ? ` · ${ctx.coords}` : ''}`);
  const n = result.rounds.length;
  lines.push(`${HEADLINE[mine][result.outcome]} · ${n} round${n === 1 ? '' : 's'}`);
  if (ctx.when) lines.push(ctx.when);
  lines.push('');

  lines.push(`${pad(mine === 'attacker' ? 'YOUR FORCE' : 'ATTACKERS', W)}${padL('SENT', 6)}${padL('LOST', 6)}`);
  for (const key of COMBATANT_KEYS) {
    const sent = result.attacker.sent[key];
    if (!sent) continue;
    lines.push(`${pad(COMBATANTS[key].name, W)}${padL(fmt(sent), 6)}${padL(fmt(result.attacker.lost[key] ?? 0), 6)}`);
  }
  lines.push('');

  lines.push(`${pad(mine === 'defender' ? 'YOUR DEFENDERS' : 'DEFENDERS', W)}${padL('HOME', 6)}${padL('LOST', 6)}`);
  for (const key of COMBATANT_KEYS) {
    const home = result.defender.home[key];
    if (!home) continue;
    lines.push(`${pad(COMBATANTS[key].name, W)}${padL(fmt(home), 6)}${padL(fmt(result.defender.lost[key] ?? 0), 6)}`);
    const fixed = ctx.repaired?.[key];
    if (fixed) lines.push(`  +${fixed} patched up by Repair Bay`);
  }
  for (const key of TURRET_TYPES) {
    const level = result.defenses[key];
    if (!level) continue;
    lines.push(`${pad(`${BUILDINGS[key].name} L${level}`, W)}  ${result.defender.turretsKnockedOut.includes(key) ? 'knocked out' : 'held'}`);
  }
  const wall = result.defenses.perimeterWall;
  if (wall) {
    const r = result.wallBreachedInRound;
    lines.push(`${pad(`Perimeter Wall L${wall}`, W)}  ${r ? `breached in round ${r}` : 'held'}`);
  }
  const shield = result.defenses.shieldGenerator;
  if (shield) {
    const absorbed = result.rounds.reduce((s, r) => s + r.shieldAbsorbed, 0);
    lines.push(`${pad(`Shield Generator L${shield}`, W)}  absorbed ${fmt(absorbed)}`);
  }
  lines.push('');

  if (result.outcome === 'attacker' && ctx.loot) {
    const label = mine === 'attacker' ? 'LOOT' : 'STOLEN';
    const parts = RESOURCES.filter((k) => ctx.loot![k] > 0).map((k) => `${fmt(ctx.loot![k])} ${LOOT_NAMES[k][ctx.loot![k] === 1 ? 0 : 1]}`);
    if (!parts.length) parts.push('nothing');
    parts.forEach((part, i) => lines.push(`${pad(i === 0 ? label : '', 8)}${part}`));
    if (ctx.carry !== undefined) {
      const total = RESOURCES.reduce((s, k) => s + ctx.loot![k], 0);
      lines.push(`${pad('', 8)}carry ${fmt(total)} / ${fmt(ctx.carry)}`);
    }
  } else if (mine === 'attacker') {
    lines.push('No loot.');
  }
  if (mine === 'defender' && ctx.salvage) lines.push(`SALVAGE +${fmt(ctx.salvage)} Alloy from the wreckage`);
  lines.push('');

  for (const r of result.rounds) {
    lines.push(`R${r.round}  ${who('attacker')} deal ${fmt(r.attackerDamage)}, ${who('defender').toLowerCase()} deal ${fmt(r.defenderDamage)}.`);
    const guard: string[] = [];
    if (r.shieldAbsorbed > 0) guard.push(`shield soaks ${fmt(r.shieldAbsorbed)}`);
    if (r.wallDamage > 0) guard.push(`wall soaks ${fmt(r.wallDamage)}`);
    if (guard.length) lines.push(`    ${guard.join(' · ')}`);
    lines.push(...wrap(`    Defenders lose ${listLosses(r.defenderLosses)}.`, 6));
    lines.push(...wrap(`    Attackers lose ${listLosses(r.attackerLosses)}.`, 6));
  }
  return lines.join('\n');
}
