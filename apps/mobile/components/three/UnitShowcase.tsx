'use dom';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PAL, TEAM, assemble, cyl, ring } from './kit';
import { HOVER, unitModel } from './units';
import { Lights, Model, SKY, Stage } from './world';

export interface UnitShowcaseProps {
  unit: string;
  team?: 'player' | 'enemy';
  dom?: DOMProps;
}

const pedestal = assemble([
  { g: cyl(3.2, 3.6, 0.6, 8), c: PAL.hullDark, p: [0, -0.3, 0] },
  { g: ring(3.25, 0.06, 32), c: TEAM.player, glow: true, p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] },
  { g: cyl(5.5, 6, 0.3, 8), c: PAL.plaza, p: [0, -0.75, 0] },
]);

/** Frames the camera on the unit, then lets the player spin it. */
function Turntable({ height, size }: { height: number; size: number }) {
  const { camera, gl } = useThree();
  const ctrl = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const reach = Math.max(height, size);
    camera.position.set(reach * 1.25 + 3, height * 0.75 + 1.5, reach * 1.6 + 4);
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, height * 0.45, 0);
    c.enablePan = false;
    c.enableZoom = false;
    c.autoRotate = true;
    c.autoRotateSpeed = 2.2;
    c.enableDamping = true;
    c.minPolarAngle = 0.6;
    c.maxPolarAngle = 1.45;
    c.update();
    ctrl.current = c;
    return () => c.dispose();
  }, [camera, gl, height, size]);
  useFrame(() => ctrl.current?.update());
  return null;
}

export default function UnitShowcase({ unit, team = 'player' }: UnitShowcaseProps) {
  const geo = unitModel(unit, TEAM[team]);
  const lift = unit === 'kestrel' ? 3.2 : HOVER[unit] ? 0.4 : 0;
  const height = geo.height + lift;
  const size = unit === 'titan' ? 9 : unit === 'kestrel' ? 5 : 3;
  return (
    <Stage>
      <Canvas key={unit} shadows flat dpr={[1, 2]} camera={{ fov: 40, near: 0.2, far: 500 }}>
        <color attach="background" args={[SKY.mid]} />
        <fog attach="fog" args={[SKY.mid, 30, 120]} />
        <Lights shadowSize={12} />
        <Model geo={pedestal} castShadow={false} scale={unit === 'titan' ? 1.6 : 1} />
        <Model geo={geo} position={[0, lift, 0]} />
        <Turntable height={height} size={size} />
      </Canvas>
    </Stage>
  );
}
