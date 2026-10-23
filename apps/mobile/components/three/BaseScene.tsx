'use dom';

import { BUILDINGS, BUILDING_TYPES } from '@ringfall/rules';
import { Canvas, useFrame } from '@react-three/fiber';
import type { DOMProps } from 'expo/dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildingModel, padModel, plusModel, scaffoldModel, wallModel } from './buildings';
import { PAL, TEAM, assemble, box, cyl, type Part } from './kit';
import { BASE_RADIUS, SPOTS, WALL_RADIUS, homeFormation } from './layout';
import { unitModel } from './units';
import { Controls, LabelLayer, LabelProjector, Lights, Model, MovingPart, Sky, Squad, Stage, Terrain, type LabelSpec } from './world';

export interface BaseSceneProps {
  levels: Record<string, number>;
  builds: { type: string; toLevel: number; startedAt: number; endsAt: number }[];
  units: Record<string, number>;
  /** Beginner protection or a shield: the base sits under a dome until then. */
  shieldUntil: number | null;
  /** Earliest incoming attack the player can see. */
  incomingAt: number | null;
  /** Server time minus this device's time, so countdowns match the server. */
  clockOffset: number;
  seed: string;
  onSelectBuilding: (type: string) => void;
  onSelectArmy?: () => void;
  dom?: DOMProps;
}

const team = TEAM.player;

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Paved plaza, paths out to every building, and the parade ground. */
function groundworks(types: string[]) {
  const parts: Part[] = [
    { g: cyl(7, 7, 0.12, 8), c: PAL.plaza, p: [0, 0.06, 0] },
    { g: box(30, 0.1, 11), c: PAL.plaza, p: [0, 0.05, 19] },
    { g: box(4, 0.11, 9), c: PAL.path, p: [0, 0.055, 26] }, // to the gate
  ];
  for (const t of types) {
    const spot = SPOTS[t];
    if (!spot || t === 'commandCenter') continue;
    const [x, z] = spot.p;
    const len = Math.hypot(x, z);
    parts.push({ g: box(1.6, 0.08, len), c: PAL.path, p: [x / 2, 0.04, z / 2], r: [0, Math.atan2(x, z), 0] });
  }
  for (let i = 0; i < 6; i++) parts.push({ g: box(0.25, 0.12, 0.25), c: PAL.glowWarm, glow: true, p: [-13 + i * 5.2, 0.1, 13.8] });
  return assemble(parts);
}

function ShieldDome({ radius }: { radius: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color(team) }, time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float time; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 2.2); float bands = 0.5 + 0.5 * sin(vY * 1.4 - time * 1.5);
      gl_FragColor = vec4(color, 0.04 + rim * 0.55 + bands * 0.03); }`,
  }), []);
  useFrame(({ clock }) => {
    material.uniforms.time!.value = clock.elapsedTime;
  });
  return (
    <mesh material={material} renderOrder={5}>
      <sphereGeometry args={[radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    </mesh>
  );
}

function Alarm() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const s = 1 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 4));
    ref.current?.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} position={[0, 11.5, 0]}>
      <sphereGeometry args={[0.7, 10, 8]} />
      <meshBasicMaterial color={PAL.glowRed} toneMapped={false} />
    </mesh>
  );
}

export default function BaseScene(props: BaseSceneProps) {
  const { levels, builds, units, shieldUntil, incomingAt, clockOffset, seed, onSelectBuilding, onSelectArmy } = props;
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 1000);
    return () => clearInterval(id);
  }, [clockOffset]);
  const registry = useRef(new Map<string, HTMLDivElement>());

  const cc = levels.commandCenter ?? 1;
  const visible = BUILDING_TYPES.filter((t) => t !== 'perimeterWall' && SPOTS[t] && ((levels[t] ?? 0) > 0 || cc >= BUILDINGS[t].unlockCC));
  // Props arrive as fresh objects on every refresh; key the expensive work on their contents.
  const builtKey = visible.filter((t) => (levels[t] ?? 0) > 0).join(',');
  const ground = useMemo(() => groundworks(builtKey ? builtKey.split(',') : []), [builtKey]);
  const unitsKey = JSON.stringify(units);
  const army = useMemo(() => homeFormation(JSON.parse(unitsKey)), [unitsKey]);

  const labels: LabelSpec[] = [...army.labels];
  const scene = visible.map((t) => {
    const level = levels[t] ?? 0;
    const job = builds.find((b) => b.type === t);
    const [x, z] = SPOTS[t]!.p;
    const ry = SPOTS[t]!.ry ?? 0;
    const tap = () => onSelectBuilding(t);
    const model = level > 0 ? buildingModel(t, level, team) : null;
    const footprint = model?.footprint ?? buildingModel(t, 1, team).footprint;
    if (t === 'commandCenter' && !job) {
      labels.push({ id: 'cc', pos: [x, (model?.base.height ?? 6) + 1.5, z], text: `Command Center · L${level}`, tone: 'level' });
    }
    if (job) {
      labels.push({ id: `job-${t}`, pos: [x, (model ? model.base.height : 2) + 2.5, z], text: `⚒ L${job.toLevel} · ${countdown(job.endsAt - now)}`, tone: 'build' });
    } else if (!model) {
      labels.push({ id: `pad-${t}`, pos: [x, 3.2, z], text: `+ ${BUILDINGS[t].name}`, tone: 'build' });
    }
    return (
      <group key={t} position={[x, 0, z]} rotation={[0, ry, 0]}>
        {model ? (
          <Model geo={model.base} onTap={tap}>
            {model.moving.map((m, i) => <MovingPart key={i} part={m} phase={x + i} />)}
          </Model>
        ) : (
          <Model geo={padModel(footprint, team)} castShadow={false} onTap={tap}>
            {!job && <MovingPart part={{ geo: plusModel(team), at: [0, 1.6, 0], motion: 'spin', speed: 1 }} />}
          </Model>
        )}
        {job && <Model geo={scaffoldModel(footprint, Math.max(3, (model?.base.height ?? 3) * 0.8))} onTap={tap} />}
      </group>
    );
  });
  if (incomingAt && incomingAt > now) {
    labels.push({ id: 'incoming', pos: [0, 13.5, 0], text: `⚠ Attack in ${countdown(incomingAt - now)}`, tone: 'alert' });
  }

  return (
    <Stage overlay={<LabelLayer labels={labels} registry={registry} />}>
      <Canvas shadows flat dpr={[1, 2]} camera={{ fov: 55, near: 0.5, far: 6000 }} gl={{ antialias: true }}>
        <Sky />
        <Lights />
        <Terrain radius={BASE_RADIUS} seed={seed} />
        <Model geo={ground} castShadow={false} />
        {(levels.perimeterWall ?? 0) > 0 && (
          <Model geo={wallModel(levels.perimeterWall!, WALL_RADIUS, team)} onTap={() => onSelectBuilding('perimeterWall')} />
        )}
        {scene}
        {army.squads.map((s) => <Squad key={s.key} geo={unitModel(s.key, team)} items={s.items} bob={s.bob} onTap={onSelectArmy} />)}
        {shieldUntil && shieldUntil > now && <ShieldDome radius={WALL_RADIUS + 3} />}
        {incomingAt && incomingAt > now && <Alarm />}
        <Controls target={[0, 0, 1]} distance={100} polar={0.88} minDistance={22} maxDistance={150} panLimit={28} />
        <LabelProjector labels={labels} registry={registry} />
      </Canvas>
    </Stage>
  );
}
