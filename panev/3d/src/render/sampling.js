// Low-discrepancy sample points for the photo accumulation (sub-pixel camera jitter and positions
// across the key light's softbox), so few frames already cover the pixel and the light evenly.

function radicalInverse(i, base) {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

// i ≥ 1; returns a point in [0, 1)².
export const halton = (i, bx = 2, by = 3) => [radicalInverse(i, bx), radicalInverse(i, by)];
