// Helpers of the installation's 3D stage (src/components/lift3d): the WebGPU adapter check, a fix for older Chromium
// builds and the resolved TRAA frame. Loaded only through the stage's boot.
import * as THREE from 'three/webgpu';

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

// A software rasteriser (SwiftShader, llvmpipe, the Basic Render Driver) draws the installation at a frame a second or
// slower and holds the page up while it does: the installation's stage falls back to the charts at once. Chrome masks
// the renderer's name behind WEBGL_debug_renderer_info; Firefox gives it as RENDERER (and warns on that extension).
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
export function softwareRenderer(context: unknown): boolean {
  if (!(context instanceof WebGL2RenderingContext)) return false;
  const plain: unknown = context.getParameter(context.RENDERER);
  if (typeof plain === 'string' && SOFTWARE.test(plain)) return true;
  if (typeof plain === 'string' && !/webkit|mozilla/i.test(plain)) return false;
  const info = context.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  return typeof name === 'string' && SOFTWARE.test(name);
}

// @types/three 0.186 leaves out TRAANode.getTextureNode(), which three 0.186 has (TRAANode.js): the resolved frame.
export function resolvedTexture(node: object): THREE.TextureNode {
  const get: unknown = Reflect.get(node, 'getTextureNode');
  const texture: unknown = typeof get === 'function' ? Reflect.apply(get, node, []) : null;
  if (!(texture instanceof THREE.TextureNode)) throw new Error('TRAA result is not a texture node');
  return texture;
}
