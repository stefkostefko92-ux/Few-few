// Blade trails: a faint ribbon standing in for a film camera's motion blur on fast swings.
import * as THREE from 'three';

// Faint ribbon behind a fast blade, standing in for a film camera's motion blur.
export class Trail {
  constructor(color) {
    this.N = 14;
    this.samples = [];
    const n = this.N;
    this.pos = new Float32Array(n * 2 * 3);
    this.alpha = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) } },
        vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); }',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  push(T, base, tip) {
    const last = this.samples[0];
    if (last && T - last.T < 1e-4) return;
    if (last && (T < last.T || T - last.T > 0.3)) this.samples.length = 0;
    this.samples.unshift({ T, base: base.clone(), tip: tip.clone() });
    if (this.samples.length > this.N) this.samples.pop();
  }

  update(T) {
    const s = this.samples;
    const maxAge = 0.075;
    for (let i = 0; i < this.N; i++) {
      const smp = s[Math.min(i, s.length - 1)];
      if (!smp) {
        this.alpha[i * 2] = 0;
        this.alpha[i * 2 + 1] = 0;
        continue;
      }
      const age = (T - smp.T) / maxAge;
      const prev = s[Math.min(i + 1, s.length - 1)];
      const dtS = Math.max(1e-3, smp.T - prev.T);
      const speed = i + 1 < s.length ? smp.tip.distanceTo(prev.tip) / dtS : 0;
      const a = Math.max(0, 1 - age) * THREE.MathUtils.clamp((speed - 5) / 12, 0, 1) * (i < s.length ? 1 : 0);
      smp.base.toArray(this.pos, i * 6);
      smp.tip.toArray(this.pos, i * 6 + 3);
      this.alpha[i * 2] = 0;
      this.alpha[i * 2 + 1] = a * 0.22;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
