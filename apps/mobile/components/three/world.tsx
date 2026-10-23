// Shared 3D pieces: sky with the Oruun Ring, terrain, lights, camera controls, models, instanced squads, labels.
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { PAL, assemble, bodyMaterial, cone, gem, glowMaterial, rock, seeded, type ModelGeometry, type Part } from './kit';
import type { Moving } from './buildings';

export const SKY = { top: '#060914', mid: '#1b2a44', horizon: '#3c4f6b', fog: '#33445e' };

// ── Sky ───────────────────────────────────────────────────────────────────────

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    top: { value: new THREE.Color(SKY.top) },
    mid: { value: new THREE.Color(SKY.mid) },
    horizon: { value: new THREE.Color(SKY.horizon) },
  },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vDir;
    void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(mix(horizon, mid, smoothstep(0.0, 0.25, h)), top, smoothstep(0.25, 0.9, h)) : horizon;
    gl_FragColor = vec4(c, 1.0); }`,
});

function Stars() {
  const geo = useMemo(() => {
    const rand = seeded('stars');
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const y = Math.abs(u) * 0.9 + 0.08;
      const r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(t) * r * 1800, y * 1800, Math.sin(t) * r * 1800);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#cbd5e1" size={2.2} sizeAttenuation={false} fog={false} />
    </points>
  );
}

/** The Ring itself: a vast band rising out of the horizon and arcing across the sky. */
function RingArch() {
  const geo = useMemo(() => {
    const band = new THREE.TorusGeometry(2200, 60, 4, 160);
    const n = band.attributes.position!.count;
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // The inner face is land (green-blue), the outer face is the Oruun hull (grey with a teal seam).
      const x = band.attributes.position!.getX(i);
      const y = band.attributes.position!.getY(i);
      const inner = Math.hypot(x, y) < 2200;
      c.set(inner ? (i % 7 === 0 ? '#3d6b5c' : '#2f5a63') : '#5b6676');
      colors.set([c.r, c.g, c.b], i * 3);
    }
    band.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return band;
  }, []);
  return (
    <group position={[300, -900, -2600]} rotation={[0.25, 0.35, 0.18]}>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors fog={false} transparent opacity={0.85} />
      </mesh>
      <mesh>
        <torusGeometry args={[2200, 8, 3, 160]} />
        <meshBasicMaterial color={PAL.glow} fog={false} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export function Sky() {
  return (
    <>
      <mesh material={skyMaterial} renderOrder={-10}>
        <sphereGeometry args={[2400, 24, 12]} />
      </mesh>
      <Stars />
      <RingArch />
      <fog attach="fog" args={[SKY.fog, 130, 480]} />
    </>
  );
}

export function Lights({ shadowSize = 45 }: { shadowSize?: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -shadowSize;
    cam.right = shadowSize;
    cam.top = shadowSize;
    cam.bottom = -shadowSize;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
  }, [shadowSize]);
  return (
    <>
      <hemisphereLight args={['#cfeaff', '#2a3a30', 1.25]} />
      <directionalLight
        ref={light}
        position={[40, 70, 30]}
        intensity={1.9}
        color="#ffe8c4"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-30, 20, -40]} intensity={0.55} color="#7dd3fc" />
    </>
  );
}

// ── Terrain ───────────────────────────────────────────────────────────────────

function noisyDisc(radius: number, segments: number, base: string, alt: string, seed: string): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, segments, 0, Math.PI * 2).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  const rand = seeded(seed);
  const a = new THREE.Color(base);
  const b = new THREE.Color(alt);
  const c = new THREE.Color();
  const n = g.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    c.copy(a).lerp(b, rand() * 0.8);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A plateau of alien ground with cliffs, the lowlands below, and scattered rocks and crystals. */
export function Terrain({ radius = 34, seed = 'ring', decorate = true }: { radius?: number; seed?: string; decorate?: boolean }) {
  const { top, cliff, low, deco } = useMemo(() => {
    const rand = seeded(seed);
    const parts: Part[] = [];
    if (decorate) {
      for (let i = 0; i < 46; i++) {
        const a = rand() * Math.PI * 2;
        const r = radius - 1 - rand() * 5;
        const s = 0.5 + rand() * 1.4;
        parts.push({ g: rock(s), c: rand() > 0.5 ? PAL.rock : PAL.cliff, p: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r], r: [rand(), rand(), rand()] });
      }
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const r = radius - 2 - rand() * 4;
        parts.push({ g: gem(0.5 + rand() * 0.6), c: i % 3 ? '#8b5cf6' : PAL.glow, glow: true, p: [Math.cos(a) * r, 0.8, Math.sin(a) * r], s: [0.6, 2.2, 0.6], r: [rand() * 0.5, rand() * 3, rand() * 0.5] });
      }
      // Distant hills on the lowlands give the horizon some shape.
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + rand() * 0.2;
        const r = 160 + rand() * 260;
        const h = 18 + rand() * 50;
        parts.push({ g: cone(h * 0.9, h, 5), c: rand() > 0.5 ? '#26332d' : '#2d2a3d', p: [Math.cos(a) * r, -8 + h / 2, Math.sin(a) * r] });
      }
    }
    const cliffGeo = new THREE.CylinderGeometry(radius, radius + 4, 8, 40, 1, true);
    return {
      top: noisyDisc(radius, 40, PAL.ground, '#4a6b55', seed),
      cliff: cliffGeo,
      low: noisyDisc(1600, 60, '#24342c', '#2c3d34', seed + 'low'),
      deco: parts.length ? assemble(parts) : null,
    };
  }, [radius, seed, decorate]);
  return (
    <>
      <mesh geometry={top} material={bodyMaterial} receiveShadow />
      <mesh geometry={cliff} position={[0, -4, 0]} receiveShadow>
        <meshStandardMaterial color={PAL.cliff} flatShading roughness={1} />
      </mesh>
      <mesh geometry={low} material={bodyMaterial} position={[0, -8, 0]} />
      {deco && <Model geo={deco} />}
    </>
  );
}

// ── Models ────────────────────────────────────────────────────────────────────

export function Model({ geo, castShadow = true, onTap, children, ...group }: {
  geo: ModelGeometry;
  castShadow?: boolean;
  onTap?: () => void;
  children?: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}) {
  const tap = onTap
    ? (e: ThreeEvent<MouseEvent>) => {
        // A drag to pan the camera also ends in a click; only count taps that barely moved.
        if (e.delta > 8) return;
        e.stopPropagation();
        onTap();
      }
    : undefined;
  return (
    <group {...group} onClick={tap}>
      {geo.body && <mesh geometry={geo.body} material={bodyMaterial} castShadow={castShadow} receiveShadow />}
      {geo.glow && <mesh geometry={geo.glow} material={glowMaterial} />}
      {children}
    </group>
  );
}

/** An animated part of a building: drills spin, turrets sweep, orbs bob. */
export function MovingPart({ part, phase = 0 }: { part: Moving; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime + phase;
    const speed = part.speed ?? 1;
    if (part.motion === 'spin') g.rotation.y = t * speed;
    else if (part.motion === 'sweep') g.rotation.y = Math.sin(t * speed * 0.5) * 1.2;
    else if (part.motion === 'bob') g.position.y = part.at[1] + Math.sin(t * 1.6) * 0.35;
    else if (part.motion === 'pulse') {
      const s = 1 + Math.sin(t * 2) * 0.04;
      g.scale.set(s, 1, s);
      g.rotation.y = t * 0.3;
    }
  });
  return (
    <group ref={ref} position={part.at}>
      <Model geo={part.geo} castShadow={part.motion !== 'pulse'} />
    </group>
  );
}

export interface Placement {
  p: [number, number, number];
  /** Facing (rotation around y). */
  ry: number;
  phase: number;
}

/** Many copies of one unit model in two draw calls, with an optional idle bob. */
export function Squad({ geo, items, bob = 0, onTap }: { geo: ModelGeometry; items: Placement[]; bob?: number; onTap?: () => void }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const v = useMemo(() => new THREE.Vector3(), []);

  const place = (t: number) => {
    items.forEach((it, i) => {
      v.set(it.p[0], it.p[1] + (bob ? Math.sin(t * 1.5 + it.phase) * bob : 0), it.p[2]);
      q.setFromAxisAngle(up, it.ry);
      m.compose(v, q, one);
      body.current?.setMatrixAt(i, m);
      glow.current?.setMatrixAt(i, m);
    });
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (glow.current) glow.current.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => place(0));
  useFrame(({ clock }) => {
    if (bob) place(clock.elapsedTime);
  });
  if (!items.length) return null;
  const tap = onTap ? (e: ThreeEvent<MouseEvent>) => { if (e.delta <= 8) { e.stopPropagation(); onTap(); } } : undefined;
  return (
    <group onClick={tap}>
      {geo.body && <instancedMesh key={`b${items.length}`} ref={body} args={[geo.body, bodyMaterial, items.length]} castShadow receiveShadow />}
      {geo.glow && <instancedMesh key={`g${items.length}`} ref={glow} args={[geo.glow, glowMaterial, items.length]} />}
    </group>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────

/** Drag to pan, pinch to zoom and tilt, within limits. */
export function Controls({ target = [0, 0, 0], distance = 70, polar = 0.95, azimuth = 0, minDistance = 20, maxDistance = 120, panLimit = 30, autoRotate = false }: {
  target?: [number, number, number]; distance?: number; polar?: number; azimuth?: number; minDistance?: number;
  maxDistance?: number; panLimit?: number; autoRotate?: boolean;
}) {
  const { camera, gl } = useThree();
  const ctrl = useRef<MapControls | null>(null);
  useEffect(() => {
    const c = new MapControls(camera, gl.domElement);
    c.target.set(...target);
    camera.position.set(
      target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
      target[1] + distance * Math.cos(polar),
      target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
    );
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = false;
    c.minDistance = minDistance;
    c.maxDistance = maxDistance;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.3;
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = 0.6;
    c.update();
    ctrl.current = c;
    return () => c.dispose();
    // Set up once per camera; after that the camera is the player's to move.
  }, [camera, gl]);
  useFrame(() => {
    const c = ctrl.current;
    if (!c) return;
    const t = c.target;
    const d = Math.hypot(t.x - target[0], t.z - target[2]);
    if (d > panLimit) {
      const k = panLimit / d;
      const dx = (t.x - target[0]) * (1 - k);
      const dz = (t.z - target[2]) * (1 - k);
      t.x -= dx;
      t.z -= dz;
      camera.position.x -= dx;
      camera.position.z -= dz;
    }
    c.update();
  });
  return null;
}

// ── Labels ────────────────────────────────────────────────────────────────────

export interface LabelSpec {
  id: string;
  pos: [number, number, number];
  text: string;
  tone?: 'level' | 'build' | 'count' | 'alert' | 'name' | 'me';
}

export type LabelRegistry = MutableRefObject<Map<string, HTMLDivElement>>;

const PRIORITY: Record<NonNullable<LabelSpec['tone']>, number> = { alert: 0, me: 1, build: 2, name: 3, count: 4, level: 5 };

/**
 * Moves the HTML labels to follow their 3D positions every frame. When two would overlap, the more important one
 * (alerts, then construction, then names, then unit counts) wins and the other hides.
 */
export function LabelProjector({ labels, registry }: { labels: LabelSpec[]; registry: LabelRegistry }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const ordered = useMemo(
    () => [...labels].sort((a, b) => PRIORITY[a.tone ?? 'level'] - PRIORITY[b.tone ?? 'level']),
    [labels],
  );
  useFrame(() => {
    const placed: [number, number, number, number][] = [];
    for (const l of ordered) {
      const el = registry.current.get(l.id);
      if (!el) continue;
      v.set(...l.pos).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      const w = el.offsetWidth || l.text.length * 7 + 16;
      const h = el.offsetHeight || 20;
      const box: [number, number, number, number] = [x - w / 2, y - h, x + w / 2, y];
      const onScreen = v.z < 1 && box[0] > 2 && box[2] < size.width - 2 && box[1] > 0 && box[3] < size.height;
      const clash = placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
      const show = onScreen && !clash;
      el.style.display = 'block';
      el.style.visibility = show ? 'visible' : 'hidden';
      if (show) {
        placed.push(box);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    }
  });
  return null;
}

const LABEL_STYLES: Record<NonNullable<LabelSpec['tone']>, React.CSSProperties> = {
  level: { background: 'rgba(10,14,19,0.75)', color: '#e6edf3', border: '1px solid #2a3644' },
  build: { background: 'rgba(15,59,55,0.9)', color: '#5eead4', border: '1px solid #2dd4bf' },
  count: { background: 'rgba(10,14,19,0.75)', color: '#cbd5e1', border: '1px solid #2a3644' },
  alert: { background: 'rgba(58,26,28,0.92)', color: '#fca5a5', border: '1px solid #f87171' },
  name: { background: 'rgba(10,14,19,0.75)', color: '#e6edf3', border: '1px solid #2a3644' },
  me: { background: 'rgba(15,59,55,0.92)', color: '#5eead4', border: '1px solid #2dd4bf' },
};

/** The HTML side of the labels; place it next to the <Canvas>. */
export function LabelLayer({ labels, registry }: { labels: LabelSpec[]; registry: LabelRegistry }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) registry.current.set(l.id, el);
            else registry.current.delete(l.id);
          }}
          style={{
            position: 'absolute', left: 0, top: 0, display: 'none', whiteSpace: 'nowrap', padding: '2px 7px',
            borderRadius: 8, font: '600 11px ui-monospace, Menlo, monospace', letterSpacing: 0.3, ...LABEL_STYLES[l.tone ?? 'level'],
          }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

/** Fills its (relatively positioned) parent. Every 3D view sits in one of these. */
export function Stage({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: SKY.fog, touchAction: 'none', userSelect: 'none' }}>
      {children}
      {overlay}
    </div>
  );
}
