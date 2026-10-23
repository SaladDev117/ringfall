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

/** Plain-text battle report, as shown in the Reports inbox. */
export function formatBattleReport(result: BattleResult, ctx: ReportContext): string {
  const mine = ctx.perspective;
  const who = (side: 'attacker' | 'defender') => (side === mine ? 'You' : 'They');
  const lines: string[] = [];
  const W = 22;

  lines.push(`⚔ RAID ON ${ctx.targetName.toUpperCase()} (${ctx.defenderName})${ctx.coords ? ` · ${ctx.coords}` : ''}`);
  const n = result.rounds.length;
  lines.push(`${HEADLINE[mine][result.outcome]} · ${n} round${n === 1 ? '' : 's'}${ctx.when ? ` · ${ctx.when}` : ''}`);
  lines.push('');

  lines.push(`${pad(mine === 'attacker' ? 'YOUR FORCE' : 'ATTACKERS', W)}${padL('SENT', 6)}${padL('LOST', 7)}`);
  for (const key of COMBATANT_KEYS) {
    const sent = result.attacker.sent[key];
    if (!sent) continue;
    lines.push(`${pad(COMBATANTS[key].name, W)}${padL(fmt(sent), 6)}${padL(fmt(result.attacker.lost[key] ?? 0), 7)}`);
  }
  lines.push('');

  lines.push(`${pad(mine === 'defender' ? 'YOUR DEFENDERS' : 'DEFENDERS', W)}${padL('HOME', 6)}${padL('LOST', 7)}`);
  for (const key of COMBATANT_KEYS) {
    const home = result.defender.home[key];
    if (!home) continue;
    const fixed = ctx.repaired?.[key];
    const note = fixed ? `   (${fixed} patched up by Repair Bay)` : '';
    lines.push(`${pad(COMBATANTS[key].name, W)}${padL(fmt(home), 6)}${padL(fmt(result.defender.lost[key] ?? 0), 7)}${note}`);
  }
  for (const key of TURRET_TYPES) {
    const level = result.defenses[key];
    if (!level) continue;
    const state = result.defender.turretsKnockedOut.includes(key) ? 'knocked out' : 'held';
    lines.push(`${pad(`${BUILDINGS[key].name} L${level}`, W)}${padL('—', 6)}   ${state}`);
  }
  const wall = result.defenses.perimeterWall;
  if (wall) {
    const r = result.wallBreachedInRound;
    lines.push(`${pad(`Perimeter Wall L${wall}`, W)}${padL('—', 6)}   ${r ? `breached in round ${r}` : 'held'}`);
  }
  const shield = result.defenses.shieldGenerator;
  if (shield) {
    const absorbed = result.rounds.reduce((s, r) => s + r.shieldAbsorbed, 0);
    lines.push(`${pad(`Shield Generator L${shield}`, W)}${padL('—', 6)}   absorbed ${fmt(absorbed)}`);
  }
  lines.push('');

  if (result.outcome === 'attacker' && ctx.loot) {
    const total = RESOURCES.reduce((s, k) => s + ctx.loot![k], 0);
    lines.push(`${mine === 'attacker' ? 'LOOT' : 'STOLEN'}   ${listResources(ctx.loot)}`);
    if (ctx.carry !== undefined) lines.push(`       (carry ${fmt(total)} / ${fmt(ctx.carry)})`);
  } else if (mine === 'attacker') {
    lines.push('No loot.');
  }
  if (mine === 'defender' && ctx.salvage) lines.push(`SALVAGE  +${fmt(ctx.salvage)} Alloy from the wreckage`);
  lines.push('');

  for (const r of result.rounds) {
    const extras: string[] = [];
    if (r.shieldAbsorbed > 0) extras.push(`+${fmt(r.shieldAbsorbed)} absorbed by the shield`);
    if (r.wallDamage > 0) extras.push(`+${fmt(r.wallDamage)} into the wall`);
    const guard = extras.length ? ` (${extras.join(', ')})` : '';
    lines.push(
      `R${r.round}  ${who('attacker')} deal ${fmt(r.attackerDamage)}${guard}; ${who('defender')} deal ${fmt(r.defenderDamage)}.`,
    );
    lines.push(`    Defenders lose ${listLosses(r.defenderLosses)}. Attackers lose ${listLosses(r.attackerLosses)}.`);
  }
  return lines.join('\n');
}
