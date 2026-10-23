// Low-poly model kit: every model is a list of primitive parts, merged into one geometry with per-part vertex
// colours (plus a second, unlit "glow" geometry). One model = one or two draw calls, which keeps phones happy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PAL = {
  hull: '#8c98a7',
  hullLight: '#c3ccd6',
  hullDark: '#4b5563',
  metal: '#64707e',
  black: '#1d232b',
  glass: '#0f1720',
  glow: '#2dd4bf',
  glowWarm: '#fbbf24',
  glowRed: '#f87171',
  window: '#fde68a',
  hazard: '#f59e0b',
  ground: '#3d5c4a',
  groundDark: '#2b4236',
  path: '#717b86',
  plaza: '#56606b',
  cliff: '#3b4048',
  rock: '#56616c',
  blight: '#6d28d9',
  blightDark: '#3b0764',
  blightFlesh: '#86198f',
  blightGlow: '#f0abfc',
};

/** Team accent colours: you, and whoever you're fighting. */
export const TEAM = { player: '#2dd4bf', enemy: '#fb923c' } as const;

type V3 = [number, number, number];

export interface Part {
  g: THREE.BufferGeometry;
  c: string;
  /** Unlit, so it reads as a light source. */
  glow?: boolean;
  p?: V3;
  r?: V3;
  s?: number | V3;
}

export interface ModelGeometry {
  body: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  /** Height of the model, handy for placing labels. */
  height: number;
}

// ── Primitive shapes (few segments on purpose: it's the look) ────────────────

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
export const dome = (r: number, w = 10) => new THREE.SphereGeometry(r, w, 5, 0, Math.PI * 2, 0, Math.PI / 2);
export const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
export const ring = (R: number, r: number, seg = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 4, seg, arc);
export const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 2, 6);
export const gem = (r: number) => new THREE.OctahedronGeometry(r);
export const rock = (r: number) => new THREE.DodecahedronGeometry(r);
export const ico = (r: number) => new THREE.IcosahedronGeometry(r);

const color = new THREE.Color();

function prepare(part: Part): THREE.BufferGeometry {
  const g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
  if (g.hasAttribute('uv')) g.deleteAttribute('uv');
  if (g.hasAttribute('uv1')) g.deleteAttribute('uv1');
  const s = part.s ?? 1;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(part.p ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.r ?? [0, 0, 0]))),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s),
  );
  g.applyMatrix4(m);
  color.set(part.c);
  const n = g.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Merges parts into one lit geometry and one glowing geometry. */
export function assemble(parts: Part[]): ModelGeometry {
  const body = parts.filter((p) => !p.glow).map(prepare);
  const glow = parts.filter((p) => p.glow).map(prepare);
  const merged = { body: body.length ? mergeGeometries(body) : null, glow: glow.length ? mergeGeometries(glow) : null };
  let height = 0;
  for (const g of [merged.body, merged.glow]) {
    if (!g) continue;
    g.computeBoundingBox();
    height = Math.max(height, g.boundingBox!.max.y);
  }
  return { ...merged, height };
}

/** Builds a model once per key. */
export function cached<A extends unknown[]>(build: (...args: A) => ModelGeometry): (...args: A) => ModelGeometry {
  const cache = new Map<string, ModelGeometry>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    let hit = cache.get(key);
    if (!hit) {
      hit = build(...args);
      cache.set(key, hit);
    }
    return hit;
  };
}

/** Mirrors parts across x = 0 (for pairs of legs, arms, wheels…). */
export function mirror(parts: Part[]): Part[] {
  return parts.flatMap((part) => {
    const [x, y, z] = part.p ?? [0, 0, 0];
    const [rx, ry, rz] = part.r ?? [0, 0, 0];
    return [part, { ...part, p: [-x, y, z] as V3, r: [rx, -ry, -rz] as V3 }];
  });
}

// ── Shared materials ─────────────────────────────────────────────────────────

export const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.15 });
export const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** A small deterministic random generator for decoration, seeded from a string. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
