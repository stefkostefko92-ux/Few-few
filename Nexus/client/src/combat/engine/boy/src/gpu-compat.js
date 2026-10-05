// Изнесено от main.js (4a.3, за лимита от 300 реда — закон #1). Непроменена логика на boy.
// Older Chromium builds type GPUTextureViewDescriptor.swizzle as a dictionary and reject the
// identity string 'rgba' that three.js always passes. Dropping an identity swizzle changes nothing.
export function acceptIdentitySwizzle() {
  const proto = globalThis.GPUTexture?.prototype;
  if (!proto) return;
  const createView = proto.createView;
  proto.createView = function view(desc) {
    if (desc?.swizzle !== 'rgba') return createView.call(this, desc);
    const { swizzle, ...rest } = desc;
    return createView.call(this, swizzle === 'rgba' ? rest : desc);
  };
}
