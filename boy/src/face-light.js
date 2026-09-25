// What the heads share on top of the scene's lights: the crew's face light and honest motion
// vectors for skin that deforms in place.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, positionLocal, positionPrevious } from 'three/tsl';

// A soft warm key from beside the camera (view space) that lights only the heads, as a film crew
// gets it from light linking: faces read in the night courtyard, on a phone too, without the
// blades next to them catching it. `level` is set per frame from the shot.
export const FACE_LIGHT = {
  direction: uniform(new THREE.Vector3(-0.45, 0.4, 0.8).normalize()),
  colour: uniform(new THREE.Color(0xffd6b4)),
  level: uniform(0),
};

// A lighting model class that adds the face light to its base's direct lighting. The light is a
// large soft source: on skin and hair its gloss spreads too thin to see, so only its diffuse
// light lands there; wet eyes (and teeth) still mirror it (`gloss`), the catchlight.
export const faceLit = (Base, { gloss = false } = {}) =>
  class extends Base {
    indirect(builder) {
      super.indirect(builder);
      const { reflectedLight } = builder.context;
      const light = { lightDirection: FACE_LIGHT.direction, lightColor: FACE_LIGHT.colour.mul(FACE_LIGHT.level) };
      if (gloss) {
        this.direct({ ...light, reflectedLight }, builder);
        return;
      }
      const { clearcoat, sheen } = this;
      this.clearcoat = this.sheen = false;
      this.direct({ ...light, reflectedLight: { directDiffuse: reflectedLight.directDiffuse, directSpecular: vec3(0).toVar() } }, builder);
      Object.assign(this, { clearcoat, sheen });
    }
  };

const FaceLitModel = faceLit(THREE.PhysicalLightingModel, { gloss: true });

// A physical material under the face light, catchlights included (eyes, teeth, lashes).
export class FaceLitMaterial extends THREE.MeshPhysicalNodeMaterial {
  static get type() {
    return 'FaceLitMaterial';
  }

  setupLightingModel() {
    return new FaceLitModel(this.useClearcoat, this.useSheen);
  }
}

// Expressions and hair shells move vertices within the head. Motion vectors must carry only the
// head's own motion: three compares the moved position with the undeformed one, which reads the
// offset as motion, and TRAA then pulls the background into the face and the hair.
export const inPlace = (node = positionLocal) =>
  Fn((builder) => {
    const p = node.toVar();
    if (builder.needsPreviousData()) positionPrevious.assign(p);
    return p;
  })();
