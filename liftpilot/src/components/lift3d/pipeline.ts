// The lift's render pipeline, on the landing page's (src/components/machine/boot.ts): scene (HDR + velocity MRT) →
// GTAO on the tiers that have it → TRAA → grade. A world and the pipeline that renders it make a stage; a new design
// builds a new stage and frees the old one with every node it owned. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { pass, mrt, output, velocity, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV, vec4, convertToTexture } from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import type { LiftDerived } from '@/lib/lift';
import { grade, type gradeUniforms } from '../machine/grade';
import { resolvedTexture } from '../machine/gpu';
import type { Quality } from '../machine/quality';
import { buildLiftWorld, type LiftWorld } from './world';

export interface Stage {
  world: LiftWorld;
  pipeline: THREE.RenderPipeline;
  owned: { dispose(): void }[];
}

/** The stage of a design; null when the world or its pipeline cannot be built. */
export function buildStage(renderer: THREE.WebGPURenderer, design: LiftDerived, quality: Quality, camera: THREE.Camera, P: ReturnType<typeof gradeUniforms>): Stage | null {
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(node: T): T => {
    owned.push(node);
    return node;
  };
  let world: LiftWorld | null = null;
  try {
    world = buildLiftWorld(renderer, design, quality);
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;
    const scenePass = pass(world.scene, camera);
    scenePass.setMRT(mrt(quality.ao ? { output, velocity, normal: vec4(packNormalToRGB(normalView), 1) } : { output, velocity }));
    const depth = scenePass.getTextureNode('depth');
    let image: THREE.TextureNode = scenePass.getTextureNode('output');
    if (quality.ao) {
      scenePass.getTexture('normal').type = THREE.UnsignedByteType;
      const packed = scenePass.getTextureNode('normal');
      const occ = keep(ao(depth, sample((st) => unpackRGBToNormal(packed.sample(st).rgb)), camera));
      occ.resolutionScale = quality.aoScale;
      occ.radius.value = 0.35;
      occ.samples.value = quality.aoSamples;
      occ.useTemporalFiltering = true;
      image = keep(convertToTexture(vec4(image.rgb.mul(occ.getTextureNode().sample(screenUV).r.mul(0.75).add(0.25)), image.a)));
    }
    image = resolvedTexture(keep(traa(image, depth, scenePass.getTextureNode('velocity'), camera)));
    pipeline.outputNode = grade(image, null, P);
    return { world, pipeline, owned };
  } catch {
    for (const node of owned) node.dispose();
    world?.dispose();
    return null;
  }
}

export function releaseStage(st: Stage): void {
  st.pipeline.dispose();
  for (const node of st.owned) node.dispose();
  st.world.dispose();
}
