// Reconstruction-filter motion blur (McGuire et al., "A Reconstruction Filter for Plausible
// Motion Blur", I3D 2012): the maximum velocity per screen tile and its 3x3 neighbourhood steer
// a depth-aware gather, so a fast blade smears over the still background behind it instead of
// only blurring inside its own silhouette. Velocities are the scene pass's NDC motion vectors.
import { HalfFloatType, RenderTarget, Vector2, NodeMaterial, RendererUtils, QuadMesh, TempNode, NodeUpdateType } from 'three/webgpu';
import { Fn, If, uniform, reference, float, vec2, vec4, uv, floor, max, min, clamp, length, dot, select, smoothstep, mix, Loop, texture, passTexture, perspectiveDepthToViewZ, interleavedGradientNoise, screenCoordinate, context } from 'three/tsl';

const _quad = /*@__PURE__*/ new QuadMesh();
const _size = /*@__PURE__*/ new Vector2();
let _state;

const target = (name) => {
  const rt = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  rt.texture.name = name;
  return rt;
};

class MotionBlurNode extends TempNode {
  static get type() {
    return 'MotionBlurNode';
  }

  constructor(colorNode, velocityNode, depthNode, camera, samples) {
    super('vec4');
    this.colorNode = colorNode;
    this.velocityNode = velocityNode;
    this.depthNode = depthNode;
    this.samples = samples;
    // Fraction of the frame the shutter is open (0.5 = a film camera's 180 degree shutter).
    this.shutter = uniform(0.5);
    this.tile = uniform(20, 'int');
    this._tiles = uniform(new Vector2(1, 1));
    this._near = reference('near', 'float', camera);
    this._far = reference('far', 'float', camera);
    this._tileRT = target('Motion.tileMax');
    this._neighbourRT = target('Motion.neighbourMax');
    this._outRT = target('Motion.output');
    this._materials = [];
    this._textureNode = passTexture(this, this._outRT.texture);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode() {
    return this._textureNode;
  }

  updateBefore(frame) {
    const { renderer } = frame;
    _state = RendererUtils.resetRendererState(renderer, _state);
    renderer.getDrawingBufferSize(_size);
    // Tiles of ~1/36 screen height: the longest blur (both directions) is two tiles.
    const k = Math.max(8, Math.round(_size.y / 36));
    this.tile.value = k;
    const tw = Math.ceil(_size.x / k);
    const th = Math.ceil(_size.y / k);
    this._tiles.value.set(tw, th);
    this._tileRT.setSize(tw, th);
    this._neighbourRT.setSize(tw, th);
    this._outRT.setSize(_size.x, _size.y);
    const [tileMat, neighbourMat, gatherMat] = this._materials;
    for (const [mat, rt, name] of [[tileMat, this._tileRT, 'Motion [ tile max ]'], [neighbourMat, this._neighbourRT, 'Motion [ neighbour max ]'], [gatherMat, this._outRT, 'Motion [ gather ]']]) {
      renderer.setRenderTarget(rt);
      _quad.material = mat;
      _quad.name = name;
      _quad.render(renderer);
    }
    RendererUtils.restoreRendererState(renderer, _state);
  }

  setup(builder) {
    // Raw textures: the internal passes read the inputs without re-running their producers.
    const color = texture(this.colorNode.value);
    const vel = texture(this.velocityNode.value);
    const depth = texture(this.depthNode.value);
    const tiles = texture(this._tileRT.texture);
    const neighbours = texture(this._neighbourRT.texture);
    const K = this.tile;
    const S = this.samples;
    const kf = float(K);

    // Half the shutter-weighted motion in pixels, clamped to one tile (the filter's reach).
    const halfMotion = (p, size) => {
      const v = vel.load(p).xy.mul(vec2(0.5, -0.5)).mul(size).mul(this.shutter).mul(0.5);
      return v.mul(min(float(1), kf.div(max(length(v), 1e-4))));
    };
    const distanceAt = (p) => perspectiveDepthToViewZ(depth.load(p).r, this._near, this._far).negate();
    const texelOf = (size) => floor(uv().mul(size));
    const keepLonger = (best, v) => best.assign(select(dot(v, v).greaterThan(dot(best, best)), v, best));

    const tileMax = Fn(() => {
      const size = vec2(vel.size());
      // The tile target is being written here, so its size comes from a uniform, not the texture.
      const origin = texelOf(this._tiles).mul(kf);
      const best = vec2(0).toVar();
      Loop(K, K, ({ i, j }) => {
        keepLonger(best, halfMotion(clamp(origin.add(vec2(float(i), float(j))), vec2(0), size.sub(1)), size));
      });
      return vec4(best, 0, 1);
    });

    const neighbourMax = Fn(() => {
      const n = this._tiles;
      const c = texelOf(n);
      const best = vec2(0).toVar();
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) keepLonger(best, tiles.load(clamp(c.add(vec2(x, y)), vec2(0), n.sub(1))).xy);
      }
      return vec4(best, 0, 1);
    });

    const cone = (d, v) => clamp(d.div(max(length(v), 1e-4)).oneMinus(), 0, 1);
    const cylinder = (d, v) => smoothstep(length(v).mul(0.95), length(v).mul(1.05).add(1e-4), d).oneMinus();
    const SOFT_Z = 0.08;

    const gather = Fn(() => {
      const size = vec2(color.size());
      const X = texelOf(size);
      const base = color.load(X);
      const vN = neighbours.load(floor(X.div(kf))).xy;
      const out = vec4(base).toVar();
      // A still neighbourhood has nothing to reconstruct.
      If(length(vN).greaterThan(0.5), () => {
        const vX = halfMotion(X, size);
        const zX = distanceAt(X);
        const jitter = interleavedGradientNoise(screenCoordinate.xy).sub(0.5);
        const weight = float(1).div(max(length(vX), 0.5)).toVar();
        const sum = base.rgb.mul(weight).toVar();
        Loop(S, ({ i }) => {
          const t = mix(float(-1), float(1), float(i).add(jitter).add(1).div(S + 1));
          const Y = clamp(floor(X.add(vN.mul(t)).add(0.5)), vec2(0), size.sub(1));
          const d = length(vN.mul(t));
          const vY = halfMotion(Y, size);
          const zY = distanceAt(Y);
          const front = clamp(zY.sub(zX).div(SOFT_Z).oneMinus(), 0, 1);
          const back = clamp(zX.sub(zY).div(SOFT_Z).oneMinus(), 0, 1);
          const a = front.mul(cone(d, vY)).add(back.mul(cone(d, vX))).add(cylinder(d, vY).mul(cylinder(d, vX)).mul(2));
          weight.addAssign(a);
          sum.addAssign(color.load(Y).rgb.mul(a));
        });
        out.assign(vec4(sum.div(weight), base.a));
      });
      return out;
    });

    const make = (fn, name) => {
      const m = new NodeMaterial();
      m.contextNode = context(builder.getSharedContext());
      m.fragmentNode = fn();
      m.name = name;
      m.needsUpdate = true;
      return m;
    };
    this._materials.forEach((m) => m.dispose());
    this._materials = [make(tileMax, 'MotionTileMax'), make(neighbourMax, 'MotionNeighbourMax'), make(gather, 'MotionGather')];
    // Registering the inputs as children makes their producers render first each frame.
    Object.assign(builder.getNodeProperties(this), { colorNode: this.colorNode, velocityNode: this.velocityNode, depthNode: this.depthNode });
    return this._textureNode;
  }

  dispose() {
    super.dispose();
    for (const rt of [this._tileRT, this._neighbourRT, this._outRT]) rt.dispose();
    this._materials.forEach((m) => m.dispose());
  }
}

// colorNode, velocityNode and depthNode must be texture nodes (a pass output or getTextureNode()).
export const motionBlur = (colorNode, velocityNode, depthNode, camera, samples = 12) => new MotionBlurNode(colorNode, velocityNode, depthNode, camera, samples);
