// backend/src/lib/shuffle.js
// Unbiased random selection via Fisher–Yates.
// `[...arr].sort(() => Math.random() - 0.5)` is NOT a uniform shuffle — the
// resulting distribution depends on the sort algorithm (V8 TimSort) and
// systematically favours part of the input. Giveaway winner selection must be
// fair, so we use a real Fisher–Yates shuffle and take the first `n`.
export function pickRandom(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
