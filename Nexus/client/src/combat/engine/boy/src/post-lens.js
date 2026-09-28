// Lens pieces of the pipeline: warm film halation bloom, horizontal anamorphic streaks from the
// brightest sources, and the thin-lens circle of confusion fed to the bokeh depth of field.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec4, float, uv, mix, smoothstep, luminance, rtt, Loop, abs, sin, asin, sign, min, max, clamp, screenSize } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export function lensGlow(image, P) {
  const glow = bloom(image, P.bloom, 0.5, 1.5);
  glow.bloomTintColors = [
    new THREE.Vector3(1.0, 0.7, 0.58),
    new THREE.Vector3(1.0, 0.84, 0.74),
    new THREE.Vector3(1.0, 0.95, 0.9),
    new THREE.Vector3(1.0, 1.0, 1.0),
    new THREE.Vector3(0.92, 0.96, 1.0),
  ];
  return glow;
}

// Bright pass smeared sideways over ~1/4 of the screen width, as an anamorphic lens flares.
export function anamorphic(image) {
  const streak = bloom(image, 1, 0, 2.2);
  streak.setResolutionScale(0.25);
  const taps = 32;
  streak.highPassFn = Fn(({ input, threshold, smoothWidth }) => {
    const bright = rtt(mix(vec4(0), input, smoothstep(threshold, threshold.add(smoothWidth), luminance(input.rgb))), null, null, { wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping });
    const total = vec4(0).toVar();
    const step = float(1).div(screenSize.x).mul(10);
    Loop({ start: -taps, end: taps }, ({ i }) => {
      const k = float(i).abs().div(taps).oneMinus();
      total.addAssign(bright.sample(vec2(uv().x.add(step.mul(float(i))), uv().y)).mul(k.mul(k)));
    });
    return total.div(taps * 0.66);
  });
  return streak;
}

// Depth of field with a physical thin lens: CoC(px) = coc * (1 - focus / distance), clamped to
// maxBlur. The bokeh node maps |viewZ - focus| through smoothstep(0, 1, .), so the returned
// "view Z" encodes the lens CoC with that curve inverted (focus distance and range are 1).
export function thinLensViewZ(scenePass, camera, P) {
  return Fn(() => {
    const dist = scenePass.getViewZNode().negate();
    const cocPx = P.coc.mul(float(1).sub(P.focus.div(max(dist, 1e-3))));
    const y = clamp(abs(cocPx).div(max(P.maxBlur, 1e-3)), 0, 1);
    const x = float(0.5).sub(sin(asin(y.mul(-2).add(1)).div(3)));
    return float(1).add(sign(cocPx).mul(min(x, 1))).negate();
  })();
}
