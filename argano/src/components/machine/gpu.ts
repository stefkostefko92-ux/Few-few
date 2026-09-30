// Helpers shared by the two 3D stages (the machine on the landing page, the installation in the app): the WebGPU
// adapter check, a fix for older Chromium builds and the resolved TRAA frame. Loaded only through the stages' boot.
import * as THREE from 'three/webgpu';
import type { Pointer } from './scene';

// Older Chromium builds reject the identity swizzle 'rgba' that three.js always passes (boy: gpu-compat.js).
// Dropping an identity swizzle changes nothing.
export function acceptIdentitySwizzle(): void {
  const ctor: unknown = Reflect.get(globalThis, 'GPUTexture');
  const proto: unknown = typeof ctor === 'function' ? Reflect.get(ctor, 'prototype') : null;
  if (typeof proto !== 'object' || proto === null || Reflect.get(proto, '__arganoSwizzle') === true) return;
  const createView: unknown = Reflect.get(proto, 'createView');
  if (typeof createView !== 'function') return;
  Reflect.set(proto, '__arganoSwizzle', true);
  Reflect.set(proto, 'createView', function view(this: object, desc?: { swizzle?: unknown }): unknown {
    if (desc?.swizzle !== 'rgba') return Reflect.apply(createView, this, [desc]) as unknown;
    const rest: Record<string, unknown> = { ...desc };
    delete rest.swizzle;
    return Reflect.apply(createView, this, [rest]) as unknown;
  });
}

export const REST: Pointer = { x: 0, y: 0 };

// WebGPU only on a hardware adapter: a software fallback adapter is slower than WebGL 2 and, in some browsers,
// unstable (errors from its error scopes every frame). Then three's WebGL 2 backend draws the same pipeline.
export async function hardwareWebGPU(): Promise<boolean> {
  const gpu: unknown = Reflect.get(navigator, 'gpu');
  const request: unknown = typeof gpu === 'object' && gpu !== null ? Reflect.get(gpu, 'requestAdapter') : null;
  if (typeof gpu !== 'object' || gpu === null || typeof request !== 'function') return false;
  try {
    const adapter: unknown = await (Reflect.apply(request, gpu, []) as Promise<unknown>);
    if (typeof adapter !== 'object' || adapter === null) return false;
    const info: unknown = Reflect.get(adapter, 'info');
    return !(Reflect.get(adapter, 'isFallbackAdapter') === true || (typeof info === 'object' && info !== null && Reflect.get(info, 'isFallbackAdapter') === true));
  } catch {
    return false;
  }
}

// @types/three 0.186 leaves out TRAANode.getTextureNode(), which three 0.186 has (TRAANode.js): the resolved frame.
export function resolvedTexture(node: object): THREE.TextureNode {
  const get: unknown = Reflect.get(node, 'getTextureNode');
  const texture: unknown = typeof get === 'function' ? Reflect.apply(get, node, []) : null;
  if (!(texture instanceof THREE.TextureNode)) throw new Error('TRAA result is not a texture node');
  return texture;
}
