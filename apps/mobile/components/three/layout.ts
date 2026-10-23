// Where everything stands in a base: building spots, the parade ground, and how armies line up.
import { UNIT_KEYS } from '@ringfall/rules';
import type { LabelSpec, Placement } from './world';

export const BASE_RADIUS = 36;
export const WALL_RADIUS = 29;

/** Building spots (x, z) around the Command Center, and the way each one faces. */
export const SPOTS: Record<string, { p: [number, number]; ry?: number }> = {
  commandCenter: { p: [0, 0] },
  alloyExtractor: { p: [-10, -6] },
  plasmaTap: { p: [10, -6] },
  relicDigSite: { p: [0, -15] },
  depot: { p: [-12, 4] },
  vault: { p: [12, 4], ry: -0.3 },
  habitat: { p: [-21, -3] },
  barracks: { p: [-6.5, 9] },
  vehicleBay: { p: [7.5, 9] },
  hangar: { p: [21, -3] },
  titanForge: { p: [-13, -17] },
  sensorArray: { p: [16, -14] },
  repairBay: { p: [-18, 8], ry: 0.5 },
  sentryTurret: { p: [-23, 13] },
  railTurret: { p: [23, 13] },
  flakTurret: { p: [6, -23] },
  shieldGenerator: { p: [8, -16] },
};

/** How many of each unit stand in the base before the rest are just a number on the label. */
const SHOWN: Record<string, number> = {
  trooper: 36, breacher: 12, wisp: 6, rattler: 4, mule: 3, bulwark: 3, kestrel: 4, hammerfall: 3, titan: 3,
};

const ICON: Record<string, string> = {
  trooper: '🪖', breacher: '🚀', wisp: '🛰', rattler: '🏎', mule: '🚚', bulwark: '🛡', kestrel: '🛩', hammerfall: '🦿', titan: '🗿',
};

export interface Formation {
  key: string;
  items: Placement[];
  bob: number;
}

const at = (x: number, y: number, z: number, ry = 0, phase = 0): Placement => ({ p: [x, y, z], ry, phase });

/** Lines the army at home up on the parade ground (and around the hangar and sensor array). */
export function homeFormation(units: Record<string, number>): { squads: Formation[]; labels: LabelSpec[] } {
  const squads: Formation[] = [];
  const labels: LabelSpec[] = [];
  const shown = (k: string) => Math.min(units[k] ?? 0, SHOWN[k] ?? 0);
  const label = (k: string, pos: [number, number, number]) => {
    const n = units[k] ?? 0;
    if (n > 0) labels.push({ id: `units-${k}`, pos, text: `${ICON[k] ?? ''} ${n.toLocaleString('en-US')}`, tone: 'count' });
  };

  // Infantry ranks on the left of the parade ground.
  const infantry: Placement[] = [];
  const breachers: Placement[] = [];
  let slot = 0;
  for (const [k, list] of [['trooper', infantry], ['breacher', breachers]] as const) {
    for (let i = 0; i < shown(k); i++, slot++) {
      list.push(at(-13 + (slot % 9) * 1.25, 0, 15 + Math.floor(slot / 9) * 1.3, 0, slot * 0.7));
    }
  }
  squads.push({ key: 'trooper', items: infantry, bob: 0.03 }, { key: 'breacher', items: breachers, bob: 0.03 });
  label('trooper', [-8, 3, 15]);
  if (shown('breacher')) label('breacher', [-8, 3, 15 + Math.ceil(slot / 9) * 1.3]);

  // Vehicles in rows on the right.
  const row = (k: string, z: number, gap: number) => {
    const items = Array.from({ length: shown(k) }, (_, i) => at(2.5 + i * gap, 0, z, 0, i));
    squads.push({ key: k, items, bob: 0 });
    label(k, [2.5 + ((items.length - 1) * gap) / 2, 3.6, z]);
  };
  row('rattler', 15.5, 3.0);
  row('mule', 19.5, 3.8);
  row('bulwark', 23.5, 3.6);

  const walkers = [at(-4.5, 0, -9.5), at(4.5, 0, -9.5), at(0, 0, -21)].slice(0, shown('hammerfall'));
  squads.push({ key: 'hammerfall', items: walkers, bob: 0 });
  if (walkers.length) label('hammerfall', [walkers[0]!.p[0], 7.5, walkers[0]!.p[2]]);

  const titans = [at(-16.5, 0, 20, 0.25), at(16.5, 0, 20, -0.25), at(0, 0, 25)].slice(0, shown('titan'));
  squads.push({ key: 'titan', items: titans, bob: 0 });
  if (titans.length) label('titan', [titans[0]!.p[0], 15.5, titans[0]!.p[2]]);

  const pad: [number, number] = [21, 1.5];
  const kestrels = Array.from({ length: shown('kestrel') }, (_, i) => {
    const a = (i / Math.max(1, shown('kestrel'))) * Math.PI * 2;
    return at(pad[0] + Math.cos(a) * 3, 6.5, pad[1] + Math.sin(a) * 3, -a, i * 1.3);
  });
  squads.push({ key: 'kestrel', items: kestrels, bob: 0.4 });
  if (kestrels.length) label('kestrel', [pad[0], 10, pad[1]]);

  const wisps = Array.from({ length: shown('wisp') }, (_, i) => {
    const a = (i / Math.max(1, shown('wisp'))) * Math.PI * 2;
    return at(16 + Math.cos(a) * 3.2, 6.5, -14 + Math.sin(a) * 3.2, -a, i);
  });
  squads.push({ key: 'wisp', items: wisps, bob: 0.35 });
  if (wisps.length) label('wisp', [16, 10.5, -14]);

  return { squads: squads.filter((s) => s.items.length), labels };
}

/** Units laid out for a battle: attackers in a block on one side, facing `facing`. */
export function battleBlock(units: Record<string, number>, origin: [number, number], facing: number, cap = 1): Formation[] {
  const out: Formation[] = [];
  let row = 0;
  const order = [...UNIT_KEYS, 'crawler', 'spitter', 'brute'].filter((k) => (units[k] ?? 0) > 0);
  for (const k of order) {
    const n = Math.min(units[k] ?? 0, Math.ceil((SHOWN[k] ?? 20) * cap));
    const big = k === 'titan' ? 9 : k === 'hammerfall' || k === 'bulwark' || k === 'mule' || k === 'brute' ? 4.5 : k === 'rattler' || k === 'kestrel' ? 3.4 : 1.4;
    const perRow = Math.max(1, Math.floor(20 / big));
    const items: Placement[] = [];
    for (let i = 0; i < n; i++) {
      const col = i % perRow;
      const r = row + Math.floor(i / perRow);
      const lateral = (col - (Math.min(n, perRow) - 1) / 2) * big;
      const depth = -r * big;
      // Rotate the block to face the target.
      const x = origin[0] + Math.cos(facing) * depth + Math.sin(facing) * lateral;
      const z = origin[1] + Math.sin(facing) * depth - Math.cos(facing) * lateral;
      items.push(at(x, k === 'kestrel' ? 6 : 0, z, -facing + Math.PI / 2, i * 0.37));
    }
    row += Math.ceil(n / perRow);
    out.push({ key: k, items, bob: k === 'kestrel' || k === 'wisp' ? 0.3 : 0 });
  }
  return out;
}
