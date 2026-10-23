// Building models. Each grows with its level (bigger, with extra tiers at 5, 10 and 15) and may have animated parts.
import * as THREE from 'three';
import { PAL, assemble, box, cached, cone, cyl, dome, gem, mirror, ring, rock, sph, type ModelGeometry, type Part } from './kit';

const H = Math.PI / 2;
type V3 = [number, number, number];

export type Motion = 'spin' | 'sweep' | 'bob' | 'pulse';

export interface Moving {
  geo: ModelGeometry;
  at: V3;
  motion: Motion;
  speed?: number;
}

export interface BuildingModel {
  base: ModelGeometry;
  moving: Moving[];
  /** Ground radius, for scaffolding, pads and labels. */
  footprint: number;
}

const grow = (level: number) => 0.85 + Math.min(level, 20) * 0.025;

function scaled(parts: Part[], k: number): Part[] {
  return parts.map((p) => {
    const s = p.s ?? 1;
    return {
      ...p,
      p: (p.p ?? [0, 0, 0]).map((v) => v * k) as V3,
      s: typeof s === 'number' ? s * k : (s.map((v) => v * k) as V3),
    };
  });
}

function around(n: number, r: number, y: number, part: (i: number, a: number) => Omit<Part, 'p'>): Part[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { ...part(i, a), p: [Math.cos(a) * r, y, Math.sin(a) * r] as V3 };
  });
}

function turretBase(team: string): Part[] {
  return [
    { g: cyl(1.2, 1.5, 1.0, 8), c: PAL.hullDark, p: [0, 0.5, 0] },
    { g: cyl(1.22, 1.22, 0.15, 8), c: team, p: [0, 0.9, 0] },
  ];
}

const commandCenter = (level: number, team: string): BuildingModel => {
  const parts: Part[] = [
    { g: cyl(4.4, 4.9, 0.6, 8), c: PAL.hullDark, p: [0, 0.3, 0] },
    { g: cyl(2.6, 3.2, 3.4, 8), c: PAL.hull, p: [0, 2.3, 0] },
    { g: cyl(2.68, 2.68, 0.35, 8), c: team, p: [0, 3.25, 0] },
    { g: dome(2.6, 10), c: PAL.hullLight, p: [0, 3.95, 0] },
    { g: cyl(0.08, 0.14, 3.2, 6), c: PAL.black, p: [0, 7.4, 0] },
    { g: sph(0.25, 6, 4), c: PAL.glowRed, glow: true, p: [0, 9.1, 0] },
    { g: box(1.6, 1.8, 0.2), c: PAL.black, p: [0, 1.5, 3.0] }, // door
    { g: box(1.4, 0.15, 0.1), c: team, glow: true, p: [0, 2.5, 3.1] },
    ...around(8, 3.02, 2.4, (_, a) => ({ g: box(0.5, 0.35, 0.1), c: PAL.window, glow: true, r: [0, -a + H, 0] })),
  ];
  if (level >= 5) {
    parts.push(...mirror([{ g: box(1.6, 2.4, 2.0), c: PAL.hull, p: [3.6, 1.5, -0.6] }, { g: box(1.62, 0.3, 2.02), c: team, p: [3.6, 2.6, -0.6] }]));
  }
  if (level >= 10) {
    parts.push(
      { g: cyl(1.6, 2.1, 1.6, 8), c: PAL.hull, p: [0, 5.6, 0] },
      { g: cyl(1.62, 1.62, 0.25, 8), c: team, glow: true, p: [0, 6.2, 0] },
    );
  }
  if (level >= 15) parts.push({ g: gem(1.1), c: PAL.glow, glow: true, p: [0, 7.6, 0], s: [0.7, 1.6, 0.7] });
  return {
    base: assemble(scaled(parts, grow(level))),
    moving: [{ geo: assemble([{ g: ring(3.6, 0.07, 32), c: team, glow: true, r: [H, 0, 0] }]), at: [0, 4.6 * grow(level), 0], motion: 'pulse' }],
    footprint: 4.8 * grow(level),
  };
};

const alloyExtractor = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const legs: Part[] = [];
  for (const z of [1.2, -1.2]) {
    legs.push(...mirror([{ g: box(0.22, 5.2, 0.22), c: PAL.metal, p: [1.15, 2.6, z], r: [z > 0 ? 0.12 : -0.12, 0, 0.12] }]));
  }
  const parts: Part[] = [
    { g: box(4.2, 0.5, 4.2), c: PAL.hullDark, p: [0, 0.25, 0] },
    ...legs,
    { g: box(1.5, 0.45, 1.5), c: PAL.hazard, p: [0, 5.2, 0] },
    { g: box(1.0, 1.0, 1.0), c: PAL.hull, p: [0, 5.9, 0] },
    { g: rock(0.9), c: PAL.rock, p: [1.4, 0.8, 1.6] },
    { g: rock(0.7), c: PAL.rock, p: [-1.6, 0.7, 1.4] },
    { g: box(1.2, 0.8, 1.0), c: team, p: [-1.4, 0.9, -1.4] },
    { g: box(0.3, 0.3, 0.06), c: PAL.window, glow: true, p: [-1.4, 1.0, -0.88] },
  ];
  const drill: Part[] = [
    { g: cyl(0.35, 0.35, 3.2, 6), c: PAL.metal, p: [0, 2.6, 0] },
    { g: cone(0.5, 1.2, 6), c: PAL.hullLight, p: [0, 0.7, 0], r: [Math.PI, 0, 0] },
    { g: ring(0.42, 0.08, 6), c: team, glow: true, p: [0, 3.0, 0], r: [H, 0, 0] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [{ geo: assemble(scaled(drill, k)), at: [0, 0, 0], motion: 'spin', speed: 3 }], footprint: 2.8 * k };
};

const plasmaTap = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: cyl(2.2, 2.6, 0.6, 6), c: PAL.hullDark, p: [0, 0.3, 0] },
    { g: cyl(0.55, 1.2, 4.6, 6), c: PAL.hull, p: [0, 2.9, 0] },
    { g: ring(1.15, 0.12, 8), c: team, glow: true, p: [0, 1.4, 0], r: [H, 0, 0] },
    { g: ring(0.95, 0.12, 8), c: team, glow: true, p: [0, 2.6, 0], r: [H, 0, 0] },
    { g: ring(0.75, 0.12, 8), c: team, glow: true, p: [0, 3.8, 0], r: [H, 0, 0] },
    { g: cone(0.9, 0.8, 6), c: PAL.hullLight, p: [0, 5.6, 0], r: [Math.PI, 0, 0] },
    ...around(3, 2.0, 0.9, (_, a) => ({ g: box(0.4, 1.2, 0.4), c: PAL.metal, r: [0, -a, 0] })),
  ];
  return {
    base: assemble(scaled(parts, k)),
    moving: [{ geo: assemble([{ g: sph(0.75, 10, 8), c: team, glow: true }]), at: [0, 6.9 * k, 0], motion: 'bob' }],
    footprint: 2.6 * k,
  };
};

const relicDigSite = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: cyl(2.4, 2.1, 0.3, 10), c: PAL.groundDark, p: [0, 0.05, 0] },
    ...around(9, 2.5, 0.4, (i) => ({ g: rock(0.45 + (i % 3) * 0.15), c: PAL.rock })),
    { g: gem(0.6), c: PAL.glow, glow: true, p: [0, 0.9, 0], s: [0.8, 1.8, 0.8] },
    { g: gem(0.4), c: PAL.glow, glow: true, p: [0.8, 0.6, 0.4], s: [0.8, 1.6, 0.8], r: [0, 0, 0.4] },
    { g: gem(0.35), c: PAL.glow, glow: true, p: [-0.7, 0.5, -0.5], s: [0.8, 1.6, 0.8], r: [0.3, 0, -0.3] },
    { g: box(0.3, 4.2, 0.3), c: PAL.metal, p: [2.6, 2.1, -1.8] },
    { g: box(3.2, 0.25, 0.25), c: PAL.hazard, p: [1.2, 4.2, -1.4], r: [0, 0.4, 0] },
    { g: box(0.05, 2.0, 0.05), c: PAL.black, p: [0, 3.1, -0.9] },
    { g: box(0.8, 0.5, 0.8), c: team, p: [2.6, 0.25, -1.8] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 3.0 * k };
};

const depot = (level: number, team: string): BuildingModel => {
  const colours = [PAL.metal, team, PAL.hull, PAL.hazard, PAL.hullDark];
  const n = Math.min(10, 3 + Math.floor(level / 2));
  const parts: Part[] = [{ g: box(5.4, 0.3, 4.2), c: PAL.plaza, p: [0, 0.15, 0] }];
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / 4);
    const slot = i % 4;
    parts.push({ g: box(2.4, 1.15, 1.2), c: colours[(i * 3) % colours.length]!, p: [slot < 2 ? -1.3 : 1.3, 0.9 + layer * 1.2, slot % 2 ? 0.7 : -0.7] });
  }
  return { base: assemble(parts), moving: [], footprint: 3.2 };
};

const vault = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: box(3.6, 2.6, 3.2), c: PAL.hullDark, p: [0, 1.3, 0] },
    { g: box(3.7, 0.3, 3.3), c: team, p: [0, 2.5, 0] },
    { g: cyl(1.05, 1.05, 0.3, 12), c: PAL.metal, p: [0, 1.3, 1.65], r: [H, 0, 0] },
    { g: ring(0.6, 0.08, 10), c: PAL.hullLight, p: [0, 1.3, 1.82] },
    { g: box(0.25, 0.25, 0.06), c: PAL.glowRed, glow: true, p: [1.2, 2.0, 1.62] },
    ...mirror([{ g: box(0.3, 0.6, 0.3), c: PAL.metal, p: [1.2, 3.0, -1.0] }]),
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 2.6 * k };
};

const habitat = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const spots: V3[] = [[-1.7, 0, 0.8], [1.7, 0, 0.8], [0, 0, -1.4]];
  if (level >= 8) spots.push([0, 0, 2.6]);
  const parts: Part[] = [{ g: cyl(3.6, 3.8, 0.3, 10), c: PAL.plaza, p: [0, 0.15, 0] }];
  for (const [x, , z] of spots) {
    parts.push(
      { g: dome(1.5, 10), c: PAL.hullLight, p: [x, 0.3, z] },
      { g: cyl(1.52, 1.52, 0.2, 10), c: team, p: [x, 0.35, z] },
      { g: box(0.35, 0.3, 0.1), c: PAL.window, glow: true, p: [x, 1.0, z + 1.32] },
    );
  }
  parts.push({ g: cyl(0.35, 0.35, 3.0, 6), c: PAL.hull, p: [0, 0.6, -0.3], r: [0, 0, H] });
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 3.6 * k };
};

const barracks = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: box(6.2, 2.4, 3.2), c: PAL.hull, p: [0, 1.2, 0] },
    { g: box(6.5, 0.35, 3.6), c: PAL.hullDark, p: [0, 2.55, 0] },
    { g: box(3.0, 0.8, 2.0), c: PAL.hullDark, p: [0, 3.0, 0] },
    { g: box(1.4, 1.8, 0.1), c: PAL.black, p: [0, 0.9, 1.62] },
    { g: box(1.2, 0.12, 0.1), c: team, glow: true, p: [0, 1.95, 1.65] },
    ...mirror([
      { g: box(0.8, 0.35, 0.08), c: PAL.window, glow: true, p: [1.9, 1.5, 1.62] },
      { g: box(0.8, 0.35, 0.08), c: PAL.window, glow: true, p: [2.9, 1.5, 1.62] },
    ]),
    { g: cyl(0.06, 0.08, 5, 6), c: PAL.metal, p: [3.6, 2.5, 1.6] },
    { g: box(1.3, 0.75, 0.05), c: team, p: [4.25, 4.5, 1.6] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 3.6 * k };
};

const vehicleBay = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: box(6.4, 3.2, 4.8), c: PAL.hullDark, p: [0, 1.6, 0] },
    { g: box(6.6, 0.4, 5.0), c: PAL.metal, p: [0, 3.3, 0] },
    { g: box(4.4, 2.6, 0.12), c: PAL.metal, p: [0, 1.3, 2.42] },
    { g: box(4.6, 0.6, 1.4), c: PAL.plaza, p: [0, 0.05, 3.2], r: [-0.08, 0, 0] },
    ...Array.from({ length: 5 }, (_, i) => ({ g: box(0.5, 0.25, 0.14), c: i % 2 ? PAL.black : PAL.hazard, p: [-1.8 + i * 0.9, 2.45, 2.45] as V3 })),
    ...mirror([{ g: box(0.3, 0.3, 0.1), c: PAL.window, glow: true, p: [2.8, 2.8, 2.42] }]),
    { g: box(6.42, 0.3, 0.2), c: team, p: [0, 2.9, 2.42] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 3.8 * k };
};

const hangar = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const shell = new THREE.CylinderGeometry(3.2, 3.2, 6.5, 12, 1, false, -H, Math.PI);
  const parts: Part[] = [
    { g: shell, c: PAL.hull, p: [0, 0.2, -1.2], r: [0, 0, H] },
    { g: box(6.4, 0.4, 6.5), c: PAL.hullDark, p: [0, 0.2, -1.2] },
    { g: cyl(3.4, 3.4, 0.2, 8), c: PAL.plaza, p: [0, 0.1, 4.6] },
    { g: ring(2.6, 0.08, 16), c: team, glow: true, p: [0, 0.25, 4.6], r: [H, 0, 0] },
    { g: box(0.3, 0.05, 1.6), c: PAL.window, glow: true, p: [0, 0.25, 4.6] },
    { g: box(1.6, 0.05, 0.3), c: PAL.window, glow: true, p: [0, 0.25, 4.6] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 4.4 * k };
};

const titanForge = (level: number, team: string): BuildingModel => {
  const parts: Part[] = [
    { g: box(9, 0.6, 7), c: PAL.hullDark, p: [0, 0.3, 0] },
    ...mirror([
      { g: box(0.7, 14, 0.7), c: PAL.metal, p: [3.8, 7, 2.8] },
      { g: box(0.7, 14, 0.7), c: PAL.metal, p: [3.8, 7, -2.8] },
      { g: box(0.3, 0.3, 5.6), c: PAL.hazard, p: [3.8, 9.5, 0] },
      { g: box(0.3, 0.3, 5.6), c: PAL.hazard, p: [3.8, 5.0, 0] },
    ]),
    { g: box(8.3, 0.7, 0.7), c: PAL.metal, p: [0, 14, 2.8] },
    { g: box(8.3, 0.7, 0.7), c: PAL.metal, p: [0, 14, -2.8] },
    { g: box(1.2, 0.8, 6.3), c: team, p: [0, 14.2, 0] },
    { g: box(0.08, 4, 0.08), c: PAL.black, p: [0, 11.8, 0] },
    { g: gem(1.4), c: team, glow: true, p: [0, 1.9, 0], s: [1, 1.2, 1] },
    { g: ring(2.6, 0.1, 16), c: team, glow: true, p: [0, 0.65, 0], r: [H, 0, 0] },
  ];
  if (level >= 3) parts.push({ g: box(8.3, 0.4, 0.4), c: PAL.metal, p: [0, 9.5, -2.8] });
  return { base: assemble(parts), moving: [], footprint: 5.2 };
};

const sensorArray = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: cyl(1.6, 1.9, 0.5, 6), c: PAL.hullDark, p: [0, 0.25, 0] },
    { g: cyl(0.35, 0.8, 5.0, 6), c: PAL.metal, p: [0, 2.8, 0] },
    { g: cyl(0.5, 0.5, 0.4, 8), c: team, p: [0, 5.2, 0] },
  ];
  const dish: Part[] = [
    { g: dome(1.8, 10), c: PAL.hullLight, p: [0, 0, 0.5], r: [-1.1, 0, 0], s: [1, 0.45, 1] },
    { g: box(0.1, 0.1, 1.4), c: PAL.black, p: [0, 0.6, 1.1], r: [0.5, 0, 0] },
    { g: sph(0.16, 6, 4), c: team, glow: true, p: [0, 0.95, 1.7] },
  ];
  return {
    base: assemble(scaled(parts, k)),
    moving: [{ geo: assemble(scaled(dish, k)), at: [0, 5.6 * k, 0], motion: 'spin', speed: 0.8 }],
    footprint: 2.0 * k,
  };
};

const repairBay = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: box(4.2, 0.4, 4.2), c: PAL.plaza, p: [0, 0.2, 0] },
    { g: box(0.45, 4.2, 0.45), c: PAL.hazard, p: [-1.7, 2.3, -1.7] },
    { g: box(3.2, 0.35, 0.35), c: PAL.hazard, p: [-0.3, 4.3, -1.7] },
    { g: box(0.06, 1.8, 0.06), c: PAL.black, p: [1.0, 3.3, -1.7] },
    { g: box(1.4, 1.0, 1.0), c: PAL.metal, p: [1.3, 0.9, 1.2] },
    { g: cyl(0.06, 0.06, 2.4, 6), c: PAL.metal, p: [-1.5, 1.4, 1.5] },
    { g: box(1.0, 0.3, 0.08), c: team, glow: true, p: [-1.5, 2.8, 1.5] },
    { g: box(0.3, 1.0, 0.08), c: team, glow: true, p: [-1.5, 2.8, 1.5] },
  ];
  return { base: assemble(scaled(parts, k)), moving: [], footprint: 2.8 * k };
};

const sentryTurret = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const head: Part[] = [
    { g: box(1.3, 0.8, 1.5), c: PAL.hull, p: [0, 0, 0] },
    { g: box(1.32, 0.2, 1.52), c: team, p: [0, 0.3, 0] },
    ...mirror([{ g: box(0.14, 0.14, 1.5), c: PAL.black, p: [0.3, 0, 1.3] }, { g: box(0.1, 0.1, 0.06), c: PAL.glowWarm, glow: true, p: [0.3, 0, 2.06] }]),
  ];
  return {
    base: assemble(scaled(turretBase(team), k)),
    moving: [{ geo: assemble(scaled(head, k)), at: [0, 1.4 * k, 0], motion: 'sweep', speed: 0.7 }],
    footprint: 1.8 * k,
  };
};

const railTurret = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const head: Part[] = [
    { g: box(1.4, 1.0, 1.8), c: PAL.hullDark, p: [0, 0, -0.2] },
    ...mirror([{ g: box(0.16, 0.3, 3.4), c: PAL.metal, p: [0.28, 0.1, 1.6] }]),
    ...[0.6, 1.3, 2.0, 2.7].map((z) => ({ g: box(0.4, 0.06, 0.06), c: team, glow: true, p: [0, 0.1, z] as V3 })),
  ];
  return {
    base: assemble(scaled(turretBase(team), k)),
    moving: [{ geo: assemble(scaled(head, k)), at: [0, 1.5 * k, 0], motion: 'sweep', speed: 0.4 }],
    footprint: 1.9 * k,
  };
};

const flakTurret = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const head: Part[] = [
    { g: cyl(0.8, 0.9, 0.7, 8), c: PAL.hull, p: [0, 0, 0] },
    ...mirror([0.2, 0.55].map((x) => ({ g: box(0.14, 0.14, 1.6), c: PAL.black, p: [x, 0.6, 0.4] as V3, r: [-0.9, 0, 0] as V3 }))),
    { g: box(0.9, 0.08, 0.08), c: PAL.glowWarm, glow: true, p: [0, 1.25, 0.9] },
  ];
  return {
    base: assemble(scaled(turretBase(team), k)),
    moving: [{ geo: assemble(scaled(head, k)), at: [0, 1.35 * k, 0], motion: 'sweep', speed: 0.9 }],
    footprint: 1.8 * k,
  };
};

const shieldGenerator = (level: number, team: string): BuildingModel => {
  const k = grow(level);
  const parts: Part[] = [
    { g: cyl(1.6, 2.0, 0.6, 6), c: PAL.hullDark, p: [0, 0.3, 0] },
    { g: cyl(0.3, 0.7, 5.0, 6), c: PAL.hull, p: [0, 3.0, 0] },
    ...[1.6, 2.8, 4.0].map((y) => ({ g: ring(0.9 - y * 0.08, 0.08, 10), c: team, glow: true, p: [0, y, 0] as V3, r: [H, 0, 0] as V3 })),
  ];
  return {
    base: assemble(scaled(parts, k)),
    moving: [{ geo: assemble([{ g: gem(0.6), c: team, glow: true, s: [1, 1.6, 1] }]), at: [0, 6.3 * k, 0], motion: 'spin', speed: 1.2 }],
    footprint: 2.0 * k,
  };
};

const MODELS: Record<string, (level: number, team: string) => BuildingModel> = {
  commandCenter, alloyExtractor, plasmaTap, relicDigSite, depot, vault, habitat, barracks, vehicleBay, hangar,
  titanForge, sensorArray, repairBay, sentryTurret, railTurret, flakTurret, shieldGenerator,
};

const cache = new Map<string, BuildingModel>();

/** The model of a building at a level (levels are bucketed so the cache stays small). */
export function buildingModel(type: string, level: number, team: string): BuildingModel {
  const key = `${type}:${level}:${team}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (MODELS[type] ?? depot)(Math.max(1, level), team);
    cache.set(key, hit);
  }
  return hit;
}

/** The perimeter wall: segments around a circle with a gate facing +z, taller with each level. */
export const wallModel = cached((level: number, radius: number, team: string): ModelGeometry => {
  const height = 1.4 + level * 0.09;
  const segments = 26;
  const parts: Part[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.02 || Math.abs(a - H) < 0.2) continue; // the gate, facing +z
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const len = ((Math.PI * 2 * radius) / segments) * 0.82;
    parts.push({ g: box(len, height, 0.9), c: PAL.hullDark, p: [x, height / 2, z], r: [0, -a + H, 0] });
    parts.push({ g: box(len, 0.2, 0.95), c: team, p: [x, height - 0.1, z], r: [0, -a + H, 0] });
    const b = a + Math.PI / segments;
    parts.push({ g: cyl(0.55, 0.65, height + 0.7, 6), c: PAL.metal, p: [Math.cos(b) * radius, (height + 0.7) / 2, Math.sin(b) * radius] });
    parts.push({ g: sph(0.22, 6, 4), c: team, glow: true, p: [Math.cos(b) * radius, height + 0.85, Math.sin(b) * radius] });
  }
  return assemble(parts);
});

/** Hazard-striped scaffolding around a footprint, for buildings under construction. */
export const scaffoldModel = cached((footprint: number, height: number): ModelGeometry => {
  const r = footprint * 0.95;
  const parts: Part[] = [];
  for (const [x, z] of [[r, r], [-r, r], [r, -r], [-r, -r]] as [number, number][]) {
    parts.push({ g: box(0.15, height, 0.15), c: PAL.hazard, p: [x, height / 2, z] });
  }
  for (const y of [height * 0.35, height * 0.7, height]) {
    parts.push(
      { g: box(r * 2, 0.1, 0.1), c: PAL.metal, p: [0, y, r] },
      { g: box(r * 2, 0.1, 0.1), c: PAL.metal, p: [0, y, -r] },
      { g: box(0.1, 0.1, r * 2), c: PAL.metal, p: [r, y, 0] },
      { g: box(0.1, 0.1, r * 2), c: PAL.metal, p: [-r, y, 0] },
    );
  }
  return assemble(parts);
});

/** A glowing pad where an unlocked building can be placed. */
export const padModel = cached((footprint: number, team: string): ModelGeometry => {
  const r = Math.max(1.6, footprint * 0.8);
  return assemble([
    { g: box(r * 2, 0.06, 0.12), c: team, glow: true, p: [0, 0.05, r] },
    { g: box(r * 2, 0.06, 0.12), c: team, glow: true, p: [0, 0.05, -r] },
    { g: box(0.12, 0.06, r * 2), c: team, glow: true, p: [r, 0.05, 0] },
    { g: box(0.12, 0.06, r * 2), c: team, glow: true, p: [-r, 0.05, 0] },
    { g: box(r * 2, 0.04, r * 2), c: PAL.plaza, p: [0, 0.02, 0] },
  ]);
});

/** A floating "+" hologram over an empty pad. */
export const plusModel = cached((team: string): ModelGeometry => assemble([
  { g: box(1.4, 0.35, 0.35), c: team, glow: true },
  { g: box(0.35, 1.4, 0.35), c: team, glow: true },
]));

/** A Blight Nest: an organic mound with glowing pustules, bigger with each level. */
export const nestModel = cached((level: number): ModelGeometry => {
  const k = 0.8 + level * 0.12;
  const parts: Part[] = [
    { g: sph(3, 9, 6), c: PAL.blightDark, p: [0, 0, 0], s: [1.2, 0.7, 1.1] },
    { g: sph(2, 8, 6), c: PAL.blight, p: [0.6, 1.4, -0.3], s: [1, 0.9, 1] },
    ...Array.from({ length: 4 + Math.min(level, 6) }, (_, i) => {
      const a = i * 2.4;
      return { g: cone(0.45, 2.6, 5), c: PAL.blightFlesh, p: [Math.cos(a) * 2.1, 1.6, Math.sin(a) * 2.1] as V3, r: [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5] as V3 };
    }),
    ...Array.from({ length: 5 }, (_, i) => {
      const a = i * 1.3 + 0.4;
      return { g: sph(0.35, 6, 4), c: PAL.blightGlow, glow: true, p: [Math.cos(a) * 2.4, 1.1 + (i % 2) * 0.6, Math.sin(a) * 2.2] as V3 };
    }),
  ];
  return assemble(scaled(parts, k));
});

/** Another commander's outpost, in miniature, for the sector map. */
export const outpostModel = cached((team: string): ModelGeometry => assemble([
  { g: cyl(3, 3.4, 0.5, 8), c: PAL.hullDark, p: [0, 0.25, 0] },
  { g: cyl(1.6, 2.0, 2.4, 8), c: PAL.hull, p: [0, 1.7, 0] },
  { g: cyl(1.65, 1.65, 0.25, 8), c: team, p: [0, 2.4, 0] },
  { g: dome(1.6, 8), c: PAL.hullLight, p: [0, 2.9, 0] },
  { g: box(1.4, 1.0, 1.4), c: PAL.hull, p: [2.4, 0.5, 1.0] },
  { g: box(1.2, 0.8, 1.6), c: PAL.metal, p: [-2.3, 0.4, 1.2] },
  { g: sph(0.25, 6, 4), c: team, glow: true, p: [0, 4.2, 0] },
  { g: cyl(0.05, 0.08, 1.2, 6), c: PAL.black, p: [0, 3.6, 0] },
]));
