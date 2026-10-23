// Balance simulator: runs a matchup many times and prints win rates and average losses.
//   pnpm sim "40 trooper, 10 rattler, 3 mule" vs "12 trooper, 2 breacher, sentry:2, wall:1" --runs 1000
//   pnpm sim "10 trooper" vs "nest:1" --report        (print one full battle report)
import { simulateBattle, repairedUnits, type BattleResult } from '../combat';
import { armyCarry, COMBATANT_KEYS, COMBATANTS, type Army } from '../units';
import { BUILDINGS } from '../buildings';
import { lootable, salvageAlloy, takeLoot } from '../loot';
import { nestLoot } from '../nests';
import { formatBattleReport } from '../report';
import { parseSide } from './parse';

function usage(): never {
  console.error('Usage: pnpm sim "<attacker>" vs "<defender>" [--runs N] [--seed S] [--report]');
  console.error('  units: "40 trooper, 10 rattler"   structures: "sentry:2, rail:1, flak:1, wall:1, shield:1, repair:5"');
  console.error('  Blight nest: "nest:5"');
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const showReport = args.includes('--report');
if (showReport) args.splice(args.indexOf('--report'), 1);
const runs = Number(flag('runs') ?? (showReport ? 1 : 1000));
const seed = flag('seed') ?? 'sim';
const vs = args.indexOf('vs');
if (vs < 1 || vs === args.length - 1 || !Number.isFinite(runs) || runs < 1) usage();

let attacker, defender;
try {
  attacker = parseSide(args.slice(0, vs).join(' '));
  defender = parseSide(args.slice(vs + 1).join(' '));
} catch (e) {
  console.error((e as Error).message);
  usage();
}

const describe = (army: Army): string =>
  COMBATANT_KEYS.filter((k) => army[k]).map((k) => `${army[k]} ${COMBATANTS[k].name}`).join(', ') || 'nobody';
const structures = Object.entries(defender.defenses).map(([k, l]) => `${BUILDINGS[k as keyof typeof BUILDINGS].name} L${l}`);

if (showReport) {
  const result = simulateBattle({ attacker: attacker.army, defender: defender.army, defenses: defender.defenses, seed });
  const carry = armyCarry(result.attacker.survivors);
  // The simulator has no real base, so assume a nest's full loot or a well-stocked defender.
  const available = defender.nestLevel ? nestLoot(defender.nestLevel) : lootable({ alloy: 20000, plasma: 15000, relics: 200 }, { alloy: 2000, plasma: 2000, relics: 100 });
  console.log(formatBattleReport(result, {
    perspective: 'attacker',
    attackerName: 'You',
    defenderName: defender.nestLevel ? 'the Blight' : 'Defender',
    targetName: defender.nestLevel ? `Blight Nest L${defender.nestLevel}` : 'Test Base',
    loot: result.outcome === 'attacker' ? takeLoot(available, carry) : undefined,
    carry,
  }));
  process.exit(0);
}

const tally = { attacker: 0, defender: 0, draw: 0 };
const lostA: Record<string, number> = {};
const lostD: Record<string, number> = {};
let rounds = 0;
let carry = 0;
let salvage = 0;
let repaired = 0;
for (let i = 0; i < runs; i++) {
  const r: BattleResult = simulateBattle({
    attacker: attacker.army, defender: defender.army, defenses: defender.defenses, seed: `${seed}-${i}`,
  });
  tally[r.outcome]++;
  rounds += r.rounds.length;
  for (const [k, n] of Object.entries(r.attacker.lost)) lostA[k] = (lostA[k] ?? 0) + n;
  for (const [k, n] of Object.entries(r.defender.lost)) lostD[k] = (lostD[k] ?? 0) + n;
  if (r.outcome === 'attacker') carry += armyCarry(r.attacker.survivors);
  salvage += salvageAlloy(r.attacker.lost);
  repaired += Object.values(repairedUnits(r.defender.lost, defender.repairBay)).reduce((a, b) => a + b, 0);
}

const pct = (n: number): string => `${((n / runs) * 100).toFixed(1)}%`;
const avg = (n: number): string => (n / runs).toFixed(1);
const losses = (lost: Record<string, number>, army: Army): string =>
  COMBATANT_KEYS.filter((k) => army[k]).map((k) => `${COMBATANTS[k].name} ${avg(lost[k] ?? 0)}/${army[k]}`).join(', ');

console.log(`Attacker: ${describe(attacker.army)}`);
console.log(`Defender: ${describe(defender.army)}${structures.length ? ` · ${structures.join(', ')}` : ''}`);
console.log(`${runs} battles`);
console.log(`  Attacker wins ${pct(tally.attacker)} · Draw ${pct(tally.draw)} · Defender wins ${pct(tally.defender)}`);
console.log(`  Average rounds ${avg(rounds)}`);
console.log('Average losses');
console.log(`  Attacker: ${losses(lostA, attacker.army) || 'none'}`);
console.log(`  Defender: ${losses(lostD, defender.army) || 'none'}`);
if (tally.attacker) console.log(`Average carry of survivors when the attacker wins: ${Math.round(carry / tally.attacker)}`);
if (!defender.nestLevel) console.log(`Average salvage for the defender: ${Math.round(salvage / runs)} Alloy`);
if (defender.repairBay) console.log(`Average units repaired (Repair Bay L${defender.repairBay}): ${avg(repaired)}`);
