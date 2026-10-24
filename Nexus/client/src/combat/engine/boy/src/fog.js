// Exponential height fog with drifting banks, warm in-scattering around every fire and a moon
// haze. Installed as scene.fogNode, so every material that keeps `fog: true` receives it.
import { Fn, vec3, vec4, float, abs, exp, max, clamp, dot, sin, length, pow, mix, select, output, positionWorld, cameraPosition, uniform } from 'three/tsl';
import { FOG, FIRE_GLOWS, MOON_DIR } from './config.js';
import { U } from './tsl.js';

// Multiplier on the fog density (1 = the look the scene was graded for).
export const fogDensity = uniform(1);

// The mirrored reflection camera sits below the ground; fog is measured from its twin above.
function viewRay() {
  const cam = vec3(cameraPosition.x, abs(cameraPosition.y), cameraPosition.z).toVar();
  const ray = positionWorld.sub(cam);
  const dist = length(ray).toVar();
  const dir = ray.div(max(dist, 1e-4)).toVar();
  return { cam, dist, dir };
}

function fogAmount({ cam, dist, dir }) {
  const k = float(FOG.falloff).mul(dir.y).mul(dist).toVar();
  const fall = select(abs(k).greaterThan(1e-4), exp(k.negate()).oneMinus().div(k), 1);
  const w = positionWorld;
  const t = U.time;
  const banks = sin(w.x.mul(0.31).add(t.mul(0.23)))
    .mul(sin(w.z.mul(0.27).sub(t.mul(0.17))))
    .add(sin(w.x.add(w.z).mul(0.61).add(t.mul(0.31))).mul(sin(w.y.mul(1.3).sub(t.mul(0.11)))).mul(0.5));
  const amount = float(FOG.density).mul(exp(cam.y.mul(-FOG.falloff))).mul(dist).mul(fall).mul(banks.mul(0.45).add(0.75));
  return exp(amount.mul(fogDensity).negate()).oneMinus();
}

function inScatter({ cam, dist, dir }) {
  let glow = vec3(FOG.color.r, FOG.color.g, FOG.color.b);
  FIRE_GLOWS.forEach((g, i) => {
    const fp = vec3(g.pos.x, g.pos.y, g.pos.z);
    const along = clamp(dot(fp.sub(cam), dir), 0, dist);
    const off = cam.add(dir.mul(along)).sub(fp);
    const flick = sin(U.time.mul(7 + i * 1.3).add(i * 1.7)).mul(0.18).add(0.82);
    glow = glow.add(vec3(...g.col).mul(flick).div(dot(off, off).mul(1.1).add(1)));
  });
  const phase = max(dot(dir, vec3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z)), 0);
  return glow.add(vec3(0.05, 0.065, 0.1).mul(pow(phase, 10).mul(0.8).add(pow(phase, 2).mul(0.12))));
}

export function installFog(scene) {
  scene.fogNode = Fn(() => {
    const ray = viewRay();
    return vec4(mix(output.rgb, inScatter(ray), fogAmount(ray)), output.a);
  })();
}

// Transmittance for additive effects that opt out of the scene fog (they must not add fog colour).
export const fogTransmittance = () => Fn(() => fogAmount(viewRay()).oneMinus())();
