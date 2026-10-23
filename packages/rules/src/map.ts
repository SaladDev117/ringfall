import { slowestSpeed, type Army } from './units';

/** The Ring is a strip that wraps around: x = RING_LENGTH − 1 sits next to x = 0. */
export const RING_LENGTH = 2400;
export const RING_WIDTH = 40;
export const SECTOR_LENGTH = 60;
export const SECTOR_COUNT = RING_LENGTH / SECTOR_LENGTH;
/** Bases a sector holds before spawning moves on to the next one. */
export const SECTOR_TARGET_BASES = 60;
/** Gate rule: no trip ever counts as longer than this many tiles. */
export const GATE_CAP_TILES = 40;

export interface Point {
  x: number;
  y: number;
}

const wrapX = (x: number): number => ((x % RING_LENGTH) + RING_LENGTH) % RING_LENGTH;

export const sectorOf = (x: number): number => Math.floor(wrapX(x) / SECTOR_LENGTH);

/** Straight-line distance in tiles, going the short way around the ring. */
export function distance(a: Point, b: Point): number {
  const dx = Math.abs(wrapX(a.x) - wrapX(b.x));
  const dy = a.y - b.y;
  return Math.hypot(Math.min(dx, RING_LENGTH - dx), dy);
}

/** Distance an army actually travels once the Gate network caps long trips. */
export const travelDistance = (a: Point, b: Point): number => Math.min(distance(a, b), GATE_CAP_TILES);

/** One-way travel time in seconds for `army` from `a` to `b`, set by its slowest unit. */
export function travelSeconds(a: Point, b: Point, army: Army): number {
  return Math.ceil((travelDistance(a, b) / slowestSpeed(army)) * 3600);
}

/** Display form, e.g. `S14 · 852, 18`. */
export const formatCoords = (p: Point): string => `S${sectorOf(p.x)} · ${wrapX(p.x)}, ${p.y}`;
