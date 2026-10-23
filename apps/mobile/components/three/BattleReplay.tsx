'use dom';

import type { BattleResult } from '@ringfall/rules';
import { Canvas, useFrame } from '@react-three/fiber';
import type { DOMProps } from 'expo/dom';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildingModel, nestModel, wallModel } from './buildings';
import { PAL, TEAM, bodyMaterial, glowMaterial, seeded } from './kit';
import { unitModel } from './units';
import { Controls, Lights, Model, Sky, Stage, Terrain } from './world';

export interface BattleReplayProps {
  battle: BattleResult;
  perspective: 'attacker' | 'defender';
  attackerName: string;
  defenderName: string;
  nest: boolean;
  /** Shown under the result, e.g. the loot. */
  summary?: string;
  dom?: DOMProps;
}

const MARCH = 3;
const ROUND = 3.2;
const roundStart = (r: number) => MARCH + (r - 1) * ROUND;

const CAP: Record<string, number> = {
  trooper: 30, breacher: 10, wisp: 5, rattler: 6, mule: 4, bulwark: 4, kestrel: 4, hammerfall: 3, titan: 2,
  crawler: 30, spitter: 10, brute: 5,
};
const SPACE: Record<string, number> = {
  trooper: 1.4, breacher: 1.4, wisp: 1.8, crawler: 1.4, spitter: 2.2, rattler: 3.4, mule: 4.4, bulwark: 4.6,
  hammerfall: 4.8, kestrel: 4.6, brute: 4.4, titan: 9.5,
};
const FRONT_TO_BACK = ['trooper', 'breacher', 'crawler', 'wisp', 'spitter', 'rattler', 'mule', 'bulwark', 'brute', 'hammerfall', 'kestrel', 'titan'];
const AIM: Record<string, number> = { titan: 8, hammerfall: 4.5, bulwark: 1.8, mule: 1.6, rattler: 1.4, kestrel: 6, brute: 2.6, spitter: 1.4 };
const TURRETS: Record<string, number> = { sentryTurret: -9, railTurret: 0, flakTurret: 9 };

interface Fig {
  side: 'a' | 'd';
  key: string;
  x: number;
  y: number;
  z: number;
  die: number | null;
  phase: number;
}

interface Shot {
  side: 'a' | 'd';
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  t1: number;
}

/** Lays a side out in ranks. Attackers face -z (rows run back toward +z); defenders face +z. */
function deploy(side: 'a' | 'd', units: Record<string, number>, frontZ: number): Fig[] {
  const dir = side === 'a' ? 1 : -1;
  const figs: Fig[] = [];
  let depth = 0;
  for (const key of FRONT_TO_BACK) {
    const n = Math.min(units[key] ?? 0, CAP[key] ?? 10);
    if (!n) continue;
    const space = SPACE[key] ?? 2;
    const perRow = Math.max(1, Math.floor(28 / space));
    const rows = Math.ceil(n / perRow);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i % perRow;
      figs.push({
        side, key, x: (col - (inRow - 1) / 2) * space, y: key === 'kestrel' ? 6 : 0,
        z: frontZ + dir * (depth + row * space + space / 2), die: null, phase: i * 0.37,
      });
    }
    depth += rows * space + 0.6;
  }
  return figs;
}

/** Decides which shown figures fall in which round, mirroring the real losses (front ranks first). */
function scheduleDeaths(figs: Fig[], initial: Record<string, number>, rounds: BattleResult['rounds'], lossKey: 'attackerLosses' | 'defenderLosses', rand: () => number) {
  for (const key of Object.keys(initial)) {
    const mine = figs.filter((f) => f.key === key).sort((a, b) => (a.side === 'a' ? a.z - b.z : b.z - a.z));
    const total = initial[key] ?? 0;
    if (!mine.length || !total) continue;
    let lost = 0;
    let alive = mine.length;
    rounds.forEach((r, i) => {
      lost += (r[lossKey] as Record<string, number>)[key] ?? 0;
      const remaining = total - lost;
      const nowAlive = remaining <= 0 ? 0 : Math.max(1, Math.round((mine.length * remaining) / total));
      for (let d = alive; d > nowAlive; d--) {
        const fig = mine[mine.length - d]!;
        fig.die = roundStart(i + 1) + 1.4 + rand() * 1.1;
      }
      alive = Math.min(alive, nowAlive);
    });
  }
}

function aimY(key: string) {
  return AIM[key] ?? 1.2;
}

function plan(battle: BattleResult, nest: boolean) {
  const rand = seeded(battle.seed);
  const attackers = deploy('a', battle.attacker.sent as Record<string, number>, 14);
  const defenders = deploy('d', battle.defender.home as Record<string, number>, nest ? -8 : -12);
  scheduleDeaths(attackers, battle.attacker.sent as Record<string, number>, battle.rounds, 'attackerLosses', rand);
  scheduleDeaths(defenders, battle.defender.home as Record<string, number>, battle.rounds, 'defenderLosses', rand);

  const turrets = Object.entries(TURRETS)
    .filter(([k]) => ((battle.defenses as Record<string, number>)[k] ?? 0) > 0)
    .map(([key, x]) => {
      const round = battle.rounds.findIndex((r) => (r.defenderLosses as Record<string, number>)[key]);
      return { key, x, z: -9, level: (battle.defenses as Record<string, number>)[key]!, dies: round >= 0 ? roundStart(round + 1) + 2 : null };
    });

  const alive = <T extends { die: number | null }>(list: T[], t: number) => list.filter((f) => f.die === null || f.die > t);
  const shots: Shot[] = [];
  battle.rounds.forEach((r, i) => {
    const start = roundStart(i + 1);
    for (const side of ['a', 'd'] as const) {
      const dmg = side === 'a' ? r.attackerDamage + r.wallDamage + r.shieldAbsorbed : r.defenderDamage;
      const count = Math.min(26, 3 + Math.floor(Math.log2(1 + dmg) * 2));
      for (let s = 0; s < count; s++) {
        const t0 = start + 0.15 + rand() * 1.9;
        const shooters: { x: number; y: number; z: number }[] = side === 'a'
          ? alive(attackers, t0).map((f) => ({ x: f.x, y: f.y + aimY(f.key), z: f.z }))
          : [
              ...alive(defenders, t0).map((f) => ({ x: f.x, y: f.y + aimY(f.key), z: f.z })),
              ...turrets.filter((tu) => tu.dies === null || tu.dies > t0).map((tu) => ({ x: tu.x, y: 2, z: tu.z })),
            ];
        const targets: { x: number; y: number; z: number }[] = side === 'a'
          ? [
              ...alive(defenders, t0 + 0.4).map((f) => ({ x: f.x, y: f.y + aimY(f.key) * 0.7, z: f.z })),
              ...turrets.filter((tu) => tu.dies === null || tu.dies > t0).map((tu) => ({ x: tu.x, y: 1.6, z: tu.z })),
            ]
          : alive(attackers, t0 + 0.4).map((f) => ({ x: f.x, y: f.y + aimY(f.key) * 0.7, z: f.z }));
        if (!shooters.length || !targets.length) continue;
        const from = shooters[Math.floor(rand() * shooters.length)]!;
        let to = targets[Math.floor(rand() * targets.length)]!;
        // While the wall stands, many shots slam into it instead.
        if (side === 'a' && !nest && battle.defenses.perimeterWall && (battle.wallBreachedInRound ?? 99) >= i + 1 && rand() < 0.5) {
          to = { x: from.x * 0.6, y: 1 + rand() * 2, z: battle.defenses.shieldGenerator && r.shieldAbsorbed > 0 ? -3.8 : -5.6 };
        }
        const a = new THREE.Vector3(from.x, from.y, from.z);
        const b = new THREE.Vector3(to.x, to.y, to.z);
        shots.push({ side, from: a, to: b, t0, t1: t0 + Math.max(0.2, a.distanceTo(b) / 55) });
      }
    }
  });
  const end = roundStart(battle.rounds.length + 1) + 0.4;
  return { attackers, defenders, turrets, shots, end };
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

/** One unit type on one side, animated: marching in, idling, and falling when its time comes. */
function Ranks({ figs, team, clock }: { figs: Fig[]; team: string; clock: { current: number } }) {
  const key = figs[0]!.key;
  const geo = unitModel(key, team);
  const body = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const t = clock.current;
    figs.forEach((f, i) => {
      const march = f.side === 'a' ? Math.max(0, 1 - t / MARCH) : 0;
      const approach = (1 - (1 - march) ** 2) * 45;
      let y = f.y + (f.key === 'kestrel' || f.key === 'wisp' ? Math.sin(t * 2 + f.phase) * 0.3 : 0);
      let tilt = 0;
      let scale = 1;
      if (f.die !== null && t > f.die) {
        const dt = t - f.die;
        tilt = Math.min(1, dt / 0.35) * (Math.PI / 2) * (f.side === 'a' ? 1 : -1);
        y -= Math.min(1, Math.max(0, dt - 0.6) / 1.4) * 2.5;
        if (f.key === 'kestrel') y -= Math.min(6, dt * 8);
        scale = dt > 2.4 ? 0 : 1;
      }
      e.set(tilt, f.side === 'a' ? Math.PI : 0, 0);
      q.setFromEuler(e);
      v.set(f.x, y, f.z + approach);
      s.setScalar(scale);
      m.compose(v, q, s);
      body.current?.setMatrixAt(i, m);
      glow.current?.setMatrixAt(i, m);
    });
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (glow.current) glow.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      {geo.body && <instancedMesh ref={body} args={[geo.body, bodyMaterial, figs.length]} castShadow frustumCulled={false} />}
      {geo.glow && <instancedMesh ref={glow} args={[geo.glow, glowMaterial, figs.length]} frustumCulled={false} />}
    </>
  );
}

/** Tracer rounds and impact flashes for one side. */
function Tracers({ shots, color, clock }: { shots: Shot[]; color: string; clock: { current: number } }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const t = clock.current;
    shots.forEach((shot, i) => {
      let k = 0;
      if (t >= shot.t0 && t <= shot.t1) {
        v.lerpVectors(shot.from, shot.to, (t - shot.t0) / (shot.t1 - shot.t0));
        k = 1;
      } else if (t > shot.t1 && t < shot.t1 + 0.18) {
        v.copy(shot.to);
        k = 2.6 * (1 - (t - shot.t1) / 0.18) + 0.6;
      }
      q.identity();
      s.setScalar(k);
      m.compose(v, q, s);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  if (!shots.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, shots.length]} frustumCulled={false}>
      <sphereGeometry args={[0.22, 6, 4]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

function Turret({ type, x, z, level, dies, team, clock }: { type: string; x: number; z: number; level: number; dies: number | null; team: string; clock: { current: number } }) {
  const model = buildingModel(type, level, team);
  const group = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = clock.current;
    const dt = dies === null ? -1 : t - dies;
    if (group.current) {
      group.current.scale.setScalar(dt > 0 ? Math.max(0.35, 1 - dt * 1.5) : 1);
      group.current.rotation.z = dt > 0 ? Math.min(0.5, dt) : 0;
    }
    if (boom.current) {
      const on = dt > 0 && dt < 1;
      boom.current.visible = on;
      boom.current.scale.setScalar(on ? 1 + dt * 5 : 0.01);
      (boom.current.material as THREE.MeshBasicMaterial).opacity = on ? 1 - dt : 0;
    }
  });
  return (
    <group position={[x, 0, z]}>
      <group ref={group}>
        <Model geo={model.base} />
        {model.moving.map((part, i) => <Model key={i} geo={part.geo} position={part.at} />)}
      </group>
      <mesh ref={boom} position={[0, 2, 0]} visible={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color={PAL.hazard} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Wall({ level, breach, team, clock }: { level: number; breach: number | null; team: string; clock: { current: number } }) {
  // A long arc of the real perimeter wall, so it reads as the same wall the defender sees at home.
  const geo = wallModel(level, 60, team);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const dt = breach === null ? -1 : clock.current - breach;
    if (ref.current) {
      ref.current.rotation.x = dt > 0 ? -Math.min(0.5, dt * 0.8) : 0;
      ref.current.position.y = dt > 0 ? -Math.min(2.5, dt * 1.5) : 0;
    }
  });
  return (
    <group ref={ref} position={[0, 0, 54]}>
      <Model geo={geo} />
    </group>
  );
}

function Barrier({ rounds, clock }: { rounds: BattleResult['rounds']; clock: { current: number } }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = clock.current;
    const i = Math.floor((t - MARCH) / ROUND);
    const active = i >= 0 && i < rounds.length && rounds[i]!.shieldAbsorbed > 0;
    const mat = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = active ? 0.18 + Math.abs(Math.sin(t * 9)) * 0.12 : 0.05;
  });
  return (
    <mesh ref={ref} position={[0, 4, -3.8]}>
      <planeGeometry args={[40, 8]} />
      <meshBasicMaterial color={TEAM.player} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Advances the shared battle clock. */
function Clock({ clock, end, onRound, onEnd }: { clock: { current: number }; end: number; onRound: (r: number) => void; onEnd: () => void }) {
  const last = useRef(-1);
  useFrame((_, dt) => {
    if (clock.current < end + 1) clock.current += Math.min(dt, 0.1);
    const r = clock.current < MARCH ? 0 : Math.floor((clock.current - MARCH) / ROUND) + 1;
    if (r !== last.current) {
      last.current = r;
      onRound(r);
    }
    if (clock.current >= end && clock.current - Math.min(dt, 0.1) < end) onEnd();
  });
  return null;
}

const OUTCOME = {
  attacker: { attacker: 'VICTORY', defender: 'DEFEAT', draw: 'DRAW' },
  defender: { attacker: 'RAIDED', defender: 'DEFENDED', draw: 'HELD' },
} as const;

export default function BattleReplay({ battle, perspective, attackerName, defenderName, nest, summary }: BattleReplayProps) {
  const [run, setRun] = useState(0);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  const clock = useRef(0);
  const p = useMemo(() => plan(battle, nest), [battle, nest]);
  const attackerTeam = perspective === 'attacker' ? TEAM.player : TEAM.enemy;
  const defenderTeam = perspective === 'attacker' ? TEAM.enemy : TEAM.player;
  const groups = (figs: Fig[]) => {
    const by = new Map<string, Fig[]>();
    for (const f of figs) by.set(f.key, [...(by.get(f.key) ?? []), f]);
    return [...by.values()];
  };
  const result = OUTCOME[perspective][battle.outcome];
  const good = (battle.outcome === 'attacker') === (perspective === 'attacker') && battle.outcome !== 'draw';

  const replay = () => {
    clock.current = 0;
    setDone(false);
    setRun((n) => n + 1);
  };

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', font: '600 13px -apple-system, system-ui, sans-serif', color: '#e6edf3' }}>
      <div style={{ position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ background: 'rgba(10,14,19,0.75)', padding: '4px 10px', borderRadius: 10 }}>
          <span style={{ color: attackerTeam }}>{attackerName}</span> ⚔ <span style={{ color: nest ? PAL.blightGlow : defenderTeam }}>{defenderName}</span>
          {round > 0 && !done ? ` · Round ${Math.min(round, battle.rounds.length)}/${battle.rounds.length}` : ''}
        </span>
      </div>
      {done && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(10,14,19,0.85)', border: `1px solid ${good ? '#4ade80' : battle.outcome === 'draw' ? '#fbbf24' : '#f87171'}`, borderRadius: 14, padding: '10px 16px' }}>
            <div style={{ fontSize: 22, letterSpacing: 4, color: good ? '#4ade80' : battle.outcome === 'draw' ? '#fbbf24' : '#f87171' }}>{result}</div>
            {summary && <div style={{ marginTop: 4, color: '#cbd5e1', fontSize: 12 }}>{summary}</div>}
            <button
              onClick={replay}
              style={{ pointerEvents: 'auto', marginTop: 8, background: '#2dd4bf', color: '#0a0e13', border: 0, borderRadius: 8, padding: '6px 14px', font: '700 13px system-ui' }}
            >
              ↻ Replay
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Stage overlay={overlay}>
      <Canvas key={run} shadows flat dpr={[1, 2]} camera={{ fov: 50, near: 0.5, far: 6000 }}>
        <Sky />
        <Lights shadowSize={40} />
        <Terrain radius={48} seed={battle.seed} />
        {nest ? (
          <Model geo={nestModel(6)} position={[0, 0, -30]} />
        ) : (
          <Model geo={buildingModel('commandCenter', 6, defenderTeam).base} position={[0, 0, -34]} />
        )}
        {!nest && (battle.defenses.perimeterWall ?? 0) > 0 && (
          <Wall level={battle.defenses.perimeterWall!} breach={battle.wallBreachedInRound ? roundStart(battle.wallBreachedInRound) + 2.2 : null} team={defenderTeam} clock={clock} />
        )}
        {!nest && (battle.defenses.shieldGenerator ?? 0) > 0 && <Barrier rounds={battle.rounds} clock={clock} />}
        {p.turrets.map((t) => <Turret key={t.key} type={t.key} x={t.x} z={t.z} level={t.level} dies={t.dies} team={defenderTeam} clock={clock} />)}
        {groups(p.attackers).map((figs) => <Ranks key={`a${figs[0]!.key}`} figs={figs} team={attackerTeam} clock={clock} />)}
        {groups(p.defenders).map((figs) => <Ranks key={`d${figs[0]!.key}`} figs={figs} team={defenderTeam} clock={clock} />)}
        <Tracers shots={p.shots.filter((x) => x.side === 'a')} color={attackerTeam} clock={clock} />
        <Tracers shots={p.shots.filter((x) => x.side === 'd')} color={nest ? PAL.blightGlow : defenderTeam} clock={clock} />
        <Clock clock={clock} end={p.end} onRound={setRound} onEnd={() => setDone(true)} />
        <Controls target={[0, 0, 2]} distance={88} polar={0.85} azimuth={0.3} minDistance={25} maxDistance={130} panLimit={30} />
      </Canvas>
    </Stage>
  );
}
