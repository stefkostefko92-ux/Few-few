// Hero WebGL сцена „THE FORGE CORE" (@react-three/fiber, three r0.171, WebGL2).
// Централен fresnel-кристал в течно energy-поле, обгърнат от GPU частици.
// Деградация по КАПАЦИТЕТ на устройството (dpr + брой частици), НЕ по reduced-motion.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  bgFragment,
  bgVertex,
  coreFragment,
  coreVertex,
  particlesFragment,
  particlesVertex,
} from './shaders';
import { pointer } from '@/lib/pointer';

// --- капацитет на устройството ---
function deviceTier(): { count: number; dpr: [number, number] } {
  if (typeof window === 'undefined') return { count: 4000, dpr: [1, 2] };
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = window.innerWidth < 820;
  const lowMem =
    typeof (navigator as { deviceMemory?: number }).deviceMemory === 'number' &&
    (navigator as { deviceMemory?: number }).deviceMemory! <= 4;
  if (coarse || small || lowMem) return { count: 1600, dpr: [1, 1.5] };
  return { count: 5200, dpr: [1, 2] };
}

// Нормализирана позиция на курсора идва от споделения pointer модул.
const mouse = new THREE.Vector2(0, 0);
function syncMouse(): void {
  mouse.set(pointer.nx, pointer.ny);
}

function Background(): React.JSX.Element {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(size.width, size.height) },
      uMouse: { value: new THREE.Vector2(0, 0) },
    }),
    // размерът се обновява в useFrame; инициализира се веднъж
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useFrame((_, dt) => {
    syncMouse(); // обнови споделената позиция на курсора веднъж за кадър
    if (!mat.current) return;
    uniforms.uTime.value += dt;
    uniforms.uRes.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    uniforms.uMouse.value.lerp(mouse, 0.05);
  });
  return (
    <mesh renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        vertexShader={bgVertex}
        fragmentShader={bgFragment}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function Core(): React.JSX.Element {
  const solid = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    if (group.current) {
      group.current.rotation.y += dt * 0.12;
      group.current.rotation.x += dt * 0.04;
      // лек parallax към курсора
      group.current.position.x += (mouse.x * 0.25 - group.current.position.x) * 0.04;
      group.current.position.y += (mouse.y * 0.25 - group.current.position.y) * 0.04;
    }
  });
  return (
    <group ref={group}>
      {/* Плътен fresnel-кристал */}
      <mesh>
        <icosahedronGeometry args={[1.35, 4]} />
        <shaderMaterial
          ref={solid}
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Wireframe обвивка */}
      <mesh scale={1.6}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial
          color="#00e5ff"
          wireframe
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Particles({ count }: { count: number }): React.JSX.Element {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const worldMouse = useMemo(() => new THREE.Vector3(999, 999, 999), []);
  const { positions, seeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // разпределение по няколко сферични обвивки
      const r = 1.9 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sd[i] = Math.random();
    }
    return { positions: pos, seeds: sd };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector3(999, 999, 999) },
      uSize: { value: 140 },
    }),
    [],
  );

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    // проектирай курсора в равнината z=0 (грубо)
    worldMouse.set(mouse.x * 3.2, mouse.y * 2.2, 0);
    uniforms.uMouse.value.lerp(worldMouse, 0.08);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={particlesVertex}
        fragmentShader={particlesFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function HeroCanvas(): React.JSX.Element {
  const tier = useMemo(deviceTier, []);
  return (
    <Canvas
      dpr={tier.dpr}
      camera={{ position: [0, 0, 4.4], fov: 50 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#000000', 1);
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Background />
      <Core />
      <Particles count={tier.count} />
    </Canvas>
  );
}
