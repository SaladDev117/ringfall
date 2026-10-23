'use dom';

import { Canvas, useFrame } from '@react-three/fiber';
import type { DOMProps } from 'expo/dom';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { nestModel, outpostModel } from './buildings';
import { PAL, TEAM, assemble, cone, gem, rock, seeded, type Part } from './kit';
import { Controls, LabelLayer, LabelProjector, Lights, Model, Sky, Stage, type LabelSpec } from './world';

export interface MapPlace {
  id: string;
  kind: 'base' | 'nest';
  name: string;
  x: number;
  y: number;
  level?: number;
  isMe?: boolean;
  friendly?: boolean;
}

export interface SectorMapProps {
  sector: number;
  places: MapPlace[];
  onSelect: (id: string) => void;
  dom?: DOMProps;
}

/** One map tile is this many world units. */
const TILE = 2.2;
const SECTOR_LENGTH = 60;
const RING_WIDTH = 40;

/** The sector as a band of land (the ring continues off both ends), scattered with rocks, crystals and hills. */
function Land({ seed }: { seed: string }) {
  const { land, deco } = useMemo(() => {
    const w = SECTOR_LENGTH * TILE * 3;
    const d = RING_WIDTH * TILE;
    const g = new THREE.PlaneGeometry(w, d, 60, 20).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    const rand = seeded(seed);
    const colors = new Float32Array(g.attributes.position!.count * 3);
    const a = new THREE.Color(PAL.ground);
    const b = new THREE.Color('#4a6b55');
    const c = new THREE.Color();
    for (let i = 0; i < g.attributes.position!.count; i += 3) {
      const x = g.attributes.position!.getX(i);
      const inSector = Math.abs(x) < (SECTOR_LENGTH * TILE) / 2;
      c.copy(a).lerp(b, rand() * 0.8);
      if (!inSector) c.multiplyScalar(0.6);
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const parts: Part[] = [];
    for (let i = 0; i < 70; i++) {
      const x = (rand() - 0.5) * w;
      const z = (rand() - 0.5) * d;
      if (rand() < 0.75) parts.push({ g: rock(0.5 + rand() * 1.2), c: rand() > 0.5 ? PAL.rock : PAL.cliff, p: [x, 0.3, z], r: [rand(), rand(), rand()] });
      else parts.push({ g: gem(0.4 + rand() * 0.5), c: rand() > 0.5 ? '#8b5cf6' : PAL.glow, glow: true, p: [x, 0.7, z], s: [0.6, 2, 0.6] });
    }
    // Walls of the Ring rise along both edges of the band.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 18; i++) {
        const x = (i / 17 - 0.5) * w;
        parts.push({ g: cone(6 + rand() * 6, 10 + rand() * 14, 5), c: '#2b3530', p: [x, 4, side * (d / 2 + 6)] });
      }
    }
    return { land: g, deco: assemble(parts) };
  }, [seed]);
  return (
    <>
      <mesh geometry={land} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <Model geo={deco} />
    </>
  );
}

function Beacon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = 1 + Math.sin(clock.elapsedTime * 3) * 0.15;
    ref.current.scale.set(k, 1, k);
  });
  return (
    <mesh ref={ref} position={position}>
      <cylinderGeometry args={[0.35, 0.35, 30, 8, 1, true]} />
      <meshBasicMaterial color={TEAM.player} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export default function SectorMap({ sector, places, onSelect }: SectorMapProps) {
  const registry = useRef(new Map<string, HTMLDivElement>());
  const x0 = sector * SECTOR_LENGTH + SECTOR_LENGTH / 2;
  const toWorld = (p: MapPlace): [number, number, number] => [(p.x - x0) * TILE, 0, (p.y - RING_WIDTH / 2) * TILE];
  const me = places.find((p) => p.isMe);
  const target: [number, number, number] = me ? toWorld(me) : [0, 0, 0];

  const labels: LabelSpec[] = places.map((p) => {
    const [x, , z] = toWorld(p);
    return p.kind === 'nest'
      ? { id: p.id, pos: [x, 5 + (p.level ?? 1) * 0.8, z], text: `✶ Nest L${p.level}`, tone: 'name' }
      : { id: p.id, pos: [x, 9, z], text: p.isMe ? `■ ${p.name}` : p.name, tone: p.isMe ? 'me' : 'name' };
  });

  return (
    <Stage overlay={<LabelLayer labels={labels} registry={registry} />}>
      <Canvas shadows flat dpr={[1, 2]} camera={{ fov: 50, near: 0.5, far: 6000 }}>
        <Sky />
        <Lights shadowSize={80} />
        <Land seed={`sector-${sector}`} />
        {places.map((p) => {
          const pos = toWorld(p);
          const tap = p.isMe ? undefined : () => onSelect(p.id);
          return p.kind === 'nest'
            ? <Model key={p.id} geo={nestModel(p.level ?? 1)} position={pos} scale={0.75} onTap={tap} />
            : <Model key={p.id} geo={outpostModel(p.isMe || p.friendly ? TEAM.player : TEAM.enemy)} position={pos} scale={1.3} onTap={tap} />;
        })}
        {me && <Beacon position={[target[0], 15, target[2]]} />}
        <Controls target={target} distance={72} polar={0.8} minDistance={25} maxDistance={180} panLimit={90} />
        <LabelProjector labels={labels} registry={registry} />
      </Canvas>
    </Stage>
  );
}
