// Unit models. Units face +z, stand on y = 0, and are sized in metres (a Trooper is ~1.8 m, a Titan ~13 m).
import { PAL, assemble, box, cached, cap, cone, cyl, gem, ico, mirror, ring, sph, type ModelGeometry, type Part } from './kit';

const H = Math.PI / 2;

function trooperParts(team: string): Part[] {
  return [
    ...mirror([
      { g: box(0.24, 0.5, 0.3), c: PAL.hullDark, p: [0.15, 0.25, 0] }, // shin
      { g: box(0.26, 0.42, 0.32), c: PAL.hull, p: [0.15, 0.68, 0] }, // thigh
      { g: box(0.26, 0.12, 0.38), c: PAL.black, p: [0.15, 0.06, 0.04] }, // boot
      { g: box(0.24, 0.2, 0.42), c: team, p: [0.42, 1.42, 0] }, // shoulder pad
      { g: box(0.16, 0.55, 0.18), c: PAL.hullDark, p: [0.38, 1.1, 0.06] }, // arm
    ]),
    { g: box(0.56, 0.32, 0.36), c: PAL.hullDark, p: [0, 0.98, 0] }, // pelvis
    { g: box(0.62, 0.6, 0.42), c: PAL.hull, p: [0, 1.36, 0] }, // torso
    { g: box(0.4, 0.26, 0.06), c: team, p: [0, 1.4, 0.22] }, // chest plate
    { g: box(0.44, 0.5, 0.22), c: PAL.metal, p: [0, 1.34, -0.3] }, // pack
    { g: sph(0.21, 8, 6), c: PAL.hullLight, p: [0, 1.82, 0] }, // helmet
    { g: box(0.32, 0.09, 0.08), c: PAL.glow, glow: true, p: [0, 1.83, 0.18] }, // visor
    { g: box(0.09, 0.12, 0.85), c: PAL.black, p: [0.26, 1.12, 0.42] }, // rifle
    { g: box(0.05, 0.05, 0.08), c: team, glow: true, p: [0.26, 1.13, 0.86] }, // muzzle light
  ];
}

const trooper = (team: string) => assemble(trooperParts(team));

const breacher = (team: string) => assemble([
  ...trooperParts(team).filter((p) => p.c !== PAL.black || p.p?.[2] !== 0.42),
  { g: cyl(0.14, 0.14, 1.2, 8), c: PAL.metal, p: [0.36, 1.75, 0.15], r: [H, 0, 0] }, // launcher tube
  { g: cyl(0.16, 0.16, 0.2, 8), c: team, p: [0.36, 1.75, -0.4], r: [H, 0, 0] },
  { g: cyl(0.1, 0.1, 0.05, 8), c: PAL.glowWarm, glow: true, p: [0.36, 1.75, 0.76], r: [H, 0, 0] },
]);

const wisp = (team: string) => assemble([
  { g: sph(0.32, 8, 6), c: PAL.hullLight, p: [0, 1.6, 0] },
  { g: sph(0.14, 6, 4), c: PAL.glow, glow: true, p: [0, 1.6, 0.25] },
  { g: ring(0.55, 0.05, 16), c: team, glow: true, p: [0, 1.6, 0], r: [H, 0, 0] },
  ...mirror([{ g: box(0.4, 0.05, 0.2), c: PAL.hull, p: [0.42, 1.6, -0.1] }]),
]);

function wheels(xs: number, zs: number[], r: number, w: number): Part[] {
  return mirror(zs.flatMap((z) => [
    { g: cyl(r, r, w, 10), c: PAL.black, p: [xs, r, z], r: [0, 0, H] } as Part,
    { g: cyl(r * 0.45, r * 0.45, w + 0.02, 6), c: PAL.metal, p: [xs, r, z], r: [0, 0, H] } as Part,
  ]));
}

const rattler = (team: string) => assemble([
  ...wheels(0.95, [-0.95, 0.95], 0.45, 0.32),
  { g: box(1.5, 0.32, 2.7), c: PAL.hull, p: [0, 0.62, 0] }, // chassis
  { g: box(1.3, 0.25, 0.9), c: team, p: [0, 0.86, 0.85] }, // hood
  { g: box(1.2, 0.5, 1.0), c: PAL.hullDark, p: [0, 0.98, -0.25] }, // cab
  ...mirror([
    { g: box(0.08, 0.7, 0.08), c: PAL.black, p: [0.6, 1.4, 0.2] }, // roll cage
    { g: box(0.08, 0.7, 0.08), c: PAL.black, p: [0.6, 1.4, -0.7] },
    { g: box(0.18, 0.1, 0.06), c: PAL.window, glow: true, p: [0.45, 0.72, 1.36] }, // headlight
  ]),
  { g: box(1.3, 0.08, 1.0), c: PAL.black, p: [0, 1.76, -0.25] },
  { g: cyl(0.22, 0.26, 0.25, 8), c: PAL.metal, p: [0, 1.92, -0.25] }, // gun mount
  { g: box(0.12, 0.12, 1.1), c: PAL.black, p: [0, 2.02, 0.25] }, // gun
  { g: box(0.08, 0.08, 0.06), c: team, glow: true, p: [0, 2.02, 0.82] },
]);

const mule = (team: string) => assemble([
  ...wheels(1.1, [-1.5, 0, 1.5], 0.55, 0.38),
  { g: box(1.9, 0.35, 4.4), c: PAL.hullDark, p: [0, 0.78, 0] },
  { g: box(1.8, 1.1, 1.3), c: PAL.hull, p: [0, 1.5, 1.45] }, // cab
  { g: box(1.6, 0.35, 0.06), c: PAL.glass, p: [0, 1.75, 2.11] }, // windscreen
  { g: box(1.9, 1.5, 2.8), c: PAL.metal, p: [0, 1.7, -0.75] }, // cargo pod
  { g: box(1.92, 0.25, 2.82), c: team, p: [0, 2.1, -0.75] }, // stripe
  ...mirror([{ g: box(0.2, 0.12, 0.06), c: PAL.window, glow: true, p: [0.6, 1.1, 2.12] }]),
]);

const bulwark = (team: string) => assemble([
  { g: box(2.6, 0.8, 3.8), c: PAL.hull, p: [0, 0.95, -0.1] }, // hull
  { g: box(2.6, 0.5, 1.2), c: PAL.hull, p: [0, 0.9, 2.1], r: [-0.45, 0, 0] }, // glacis
  ...mirror([
    { g: box(0.5, 0.7, 4.2), c: PAL.hullDark, p: [1.45, 0.75, 0] }, // side skirt
    { g: box(0.52, 0.18, 2.4), c: team, p: [1.45, 1.05, -0.2] },
    { g: cyl(0.45, 0.45, 0.12, 10), c: PAL.glow, glow: true, p: [0.9, 0.3, 1.2] }, // hover pads
    { g: cyl(0.45, 0.45, 0.12, 10), c: PAL.glow, glow: true, p: [0.9, 0.3, -1.3] },
  ]),
  { g: cyl(1.0, 1.15, 0.6, 8), c: PAL.hullLight, p: [0, 1.65, -0.3] }, // turret
  { g: box(1.2, 0.35, 1.2), c: PAL.hullDark, p: [0, 2.0, -0.5] },
  { g: cyl(0.14, 0.17, 2.6, 8), c: PAL.black, p: [0, 1.7, 1.75], r: [H, 0, 0] }, // barrel
  { g: cyl(0.21, 0.21, 0.4, 8), c: PAL.metal, p: [0, 1.7, 2.9], r: [H, 0, 0] }, // muzzle brake
  { g: box(0.3, 0.15, 0.1), c: team, glow: true, p: [0, 2.0, 0.12] }, // sensor
]);

const kestrel = (team: string) => assemble([
  { g: cap(0.55, 2.8), c: PAL.hull, p: [0, 0, 0], r: [H, 0, 0] }, // fuselage
  { g: sph(0.5, 8, 6), c: PAL.glow, glow: true, p: [0, 0.18, 1.6], s: [0.8, 0.55, 1] }, // canopy
  ...mirror([
    { g: box(2.0, 0.12, 1.1), c: PAL.hullDark, p: [1.3, 0, -0.2], r: [0, 0, -0.08] }, // wing
    { g: box(0.5, 0.14, 0.9), c: team, p: [2.35, -0.08, -0.2] }, // wing tip
    { g: cyl(0.35, 0.3, 1.3, 8), c: PAL.metal, p: [2.4, -0.45, -0.2] }, // engine pod
    { g: cyl(0.28, 0.28, 0.08, 8), c: PAL.glow, glow: true, p: [2.4, -1.12, -0.2] }, // thrust
    { g: box(0.08, 0.7, 0.6), c: team, p: [0.4, 0.55, -1.6], r: [0, 0, 0.3] }, // tail fin
  ]),
  { g: box(0.2, 0.2, 1.0), c: PAL.black, p: [0, -0.5, 1.4] }, // chin gun
]);

const hammerfall = (team: string) => assemble([
  ...mirror([
    { g: box(0.32, 2.0, 0.32), c: PAL.hullDark, p: [1.1, 2.8, 0.9], r: [0.5, 0, 0.35] }, // upper legs
    { g: box(0.32, 2.0, 0.32), c: PAL.hullDark, p: [1.1, 2.8, -0.9], r: [-0.5, 0, 0.35] },
    { g: box(0.28, 2.4, 0.28), c: PAL.metal, p: [1.75, 1.15, 1.55], r: [-0.15, 0, -0.1] }, // lower legs
    { g: box(0.28, 2.4, 0.28), c: PAL.metal, p: [1.75, 1.15, -1.55], r: [0.15, 0, -0.1] },
    { g: box(0.6, 0.15, 0.6), c: PAL.black, p: [1.85, 0.07, 1.7] }, // feet
    { g: box(0.6, 0.15, 0.6), c: PAL.black, p: [1.85, 0.07, -1.7] },
  ]),
  { g: box(1.8, 1.1, 2.4), c: PAL.hull, p: [0, 3.6, 0] }, // body
  { g: box(1.82, 0.3, 2.42), c: team, p: [0, 3.95, 0] },
  { g: box(0.5, 0.25, 0.1), c: PAL.glowRed, glow: true, p: [0, 3.6, 1.22] }, // eye
  { g: cyl(0.32, 0.4, 3.6, 8), c: PAL.hullDark, p: [0, 5.1, 0.6], r: [0.75, 0, 0] }, // artillery barrel
  { g: cyl(0.55, 0.55, 0.9, 8), c: PAL.metal, p: [0, 4.3, -0.3], r: [0.75, 0, 0] },
]);

const titan = (team: string) => assemble([
  ...mirror([
    { g: box(1.4, 0.6, 2.2), c: PAL.black, p: [1.25, 0.3, 0.25] }, // foot
    { g: box(1.1, 3.0, 1.2), c: PAL.hullDark, p: [1.25, 2.1, 0] }, // shin
    { g: box(1.3, 0.9, 1.3), c: team, p: [1.25, 3.7, 0.15] }, // knee
    { g: box(1.2, 2.6, 1.3), c: PAL.hull, p: [1.25, 5.3, 0] }, // thigh
    { g: box(2.0, 1.6, 2.2), c: team, p: [3.3, 10.4, 0] }, // shoulder
    { g: box(0.2, 1.4, 2.0), c: PAL.glow, glow: true, p: [4.32, 10.4, 0] }, // shoulder trim
    { g: box(1.1, 2.6, 1.2), c: PAL.hull, p: [3.4, 8.4, 0] }, // upper arm
    { g: gem(0.7), c: PAL.glow, glow: true, p: [1.1, 12.4, -1.4], s: [0.5, 2.2, 0.5], r: [-0.4, 0, 0.35] }, // back fins
  ]),
  { g: box(2.6, 1.2, 1.6), c: PAL.hullDark, p: [0, 6.9, 0] }, // pelvis
  { g: box(4.2, 3.6, 2.6), c: PAL.hull, p: [0, 9.6, 0] }, // torso
  { g: box(3.0, 1.2, 2.0), c: PAL.hullLight, p: [0, 7.8, 0.2] }, // abdomen
  { g: gem(0.8), c: PAL.glow, glow: true, p: [0, 9.8, 1.35], s: [1, 1.2, 0.6] }, // Oruun core
  { g: ring(1.1, 0.12, 12), c: team, p: [0, 9.8, 1.3] },
  { g: box(1.3, 1.1, 1.3), c: PAL.hullLight, p: [0, 12.0, 0.2] }, // head
  { g: box(1.0, 0.22, 0.1), c: PAL.glow, glow: true, p: [0, 12.05, 0.88] }, // visor
  // Right arm: a cannon. Left arm: an Oruun blade.
  { g: box(1.2, 2.4, 1.3), c: PAL.hullDark, p: [3.4, 6.2, 0.3] },
  { g: cyl(0.55, 0.65, 3.2, 8), c: PAL.metal, p: [3.4, 5.4, 1.6], r: [H, 0, 0] },
  { g: cyl(0.4, 0.4, 0.2, 8), c: PAL.glow, glow: true, p: [3.4, 5.4, 3.25], r: [H, 0, 0] },
  { g: box(1.2, 2.4, 1.3), c: PAL.hullDark, p: [-3.4, 6.2, 0.3] },
  { g: box(0.25, 4.2, 1.1), c: PAL.glow, glow: true, p: [-3.4, 3.8, 0.9], r: [0.15, 0, 0] },
  { g: box(0.4, 4.0, 0.3), c: PAL.hullLight, p: [-3.4, 3.8, 0.3], r: [0.15, 0, 0] },
]);

// ── The Blight ────────────────────────────────────────────────────────────────

function legs(n: number, spread: number, len: number, y: number): Part[] {
  return mirror(Array.from({ length: n }, (_, i) => {
    const z = (i - (n - 1) / 2) * spread;
    return { g: box(0.08, len, 0.08), c: PAL.blightDark, p: [0.45, y * 0.6, z], r: [0, 0, 0.9] } as Part;
  }));
}

const crawler = () => assemble([
  ...legs(3, 0.35, 0.8, 0.5),
  { g: sph(0.45, 8, 6), c: PAL.blight, p: [0, 0.5, 0], s: [1, 0.6, 1.4] },
  { g: sph(0.25, 6, 4), c: PAL.blightFlesh, p: [0, 0.55, 0.6] },
  ...mirror([{ g: sph(0.06, 4, 3), c: PAL.blightGlow, glow: true, p: [0.1, 0.62, 0.8] }]),
]);

const spitter = () => assemble([
  ...legs(2, 0.6, 1.2, 0.8),
  { g: sph(0.7, 8, 6), c: PAL.blight, p: [0, 1.0, -0.2], s: [1, 0.9, 1.2] },
  { g: sph(0.45, 8, 6), c: PAL.blightGlow, glow: true, p: [0, 1.5, -0.5] }, // acid sac
  { g: cone(0.25, 1.0, 6), c: PAL.blightFlesh, p: [0, 1.3, 0.75], r: [1.2, 0, 0] },
]);

const brute = () => assemble([
  ...mirror([
    { g: box(0.7, 1.6, 0.7), c: PAL.blightDark, p: [0.8, 0.8, -0.3] }, // legs
    { g: box(0.8, 2.2, 0.8), c: PAL.blightFlesh, p: [1.6, 1.6, 0.6], r: [0.3, 0, 0.3] }, // arms
    { g: ico(0.6), c: PAL.blightDark, p: [1.9, 0.6, 1.0] }, // fists
  ]),
  { g: ico(1.6), c: PAL.blight, p: [0, 2.6, 0], s: [1.2, 1, 1] },
  { g: ico(0.9), c: PAL.blightDark, p: [0, 3.6, -0.4] },
  { g: box(0.8, 0.2, 0.1), c: PAL.blightGlow, glow: true, p: [0, 2.9, 1.55] },
]);

const BUILDERS: Record<string, (team: string) => ModelGeometry> = {
  trooper, breacher, wisp, rattler, mule, bulwark, kestrel, hammerfall, titan, crawler, spitter, brute,
};

/** The model for any combatant key (`trooper`, `titan`, `crawler`…), in a team colour. */
export const unitModel = cached((key: string, team: string): ModelGeometry => (BUILDERS[key] ?? trooper)(team));

/** Rough footprint radius, for spacing formations. */
export const UNIT_SIZE: Record<string, number> = {
  trooper: 0.9, breacher: 0.9, wisp: 1.0, rattler: 2.0, mule: 2.6, bulwark: 2.8, kestrel: 3.0, hammerfall: 3.2, titan: 6.0,
  crawler: 1.0, spitter: 1.4, brute: 2.6,
};

/** Units that fly, so they hover above the ground. */
export const HOVER: Record<string, number> = { kestrel: 5, wisp: 0.6 };
