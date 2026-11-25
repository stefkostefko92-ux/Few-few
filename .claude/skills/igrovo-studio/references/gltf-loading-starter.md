> Част от умението `igrovo-studio` (справочник `gltf-loading-starter.md` от `openai/plugins` @ `981b02c0c440`, MIT; променено от Carbon Stealth VCC на 2026-11-23).
> Важат „Наши предпазители“ от `../SKILL.md`: зависимости, нищо от CDN, активи, localhost, сървърът решава, достъпност.

# GLB Loading Starter

Use this as the canonical minimal pattern for loading shipped 3D content.

## Vanilla Three.js

```ts
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const draco = new DRACOLoader();
draco.setDecoderPath("/draco/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

gltfLoader.load("/assets/hero.glb", (gltf) => {
  const root = gltf.scene;
  root.traverse((node) => {
    if ("castShadow" in node) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  scene.add(root);
});
```

## React Three Fiber

```tsx
import { useGLTF } from "@react-three/drei";

function HeroModel() {
  const gltf = useGLTF("/assets/hero.glb", "/draco/"); // our decoder; without it drei fetches Draco from www.gstatic.com
  return <primitive object={gltf.scene} />;
}
```

## Notes

- Default shipping format is GLB or glTF 2.0.
- Keep optimization upstream in the asset pipeline; loader code should stay boring.
- Decoders and transcoders (Draco, KTX2/Basis) are served from our own origin (`/draco/`, `/basis/`), never from a CDN default. In drei pass the path to `useGLTF(path, "/draco/")` or call `useGLTF.setDecoderPath("/draco/")` once.
