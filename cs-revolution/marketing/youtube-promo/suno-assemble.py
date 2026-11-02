"""Музиката на клипа от песента на Suno: откъси (runs), закотвени на точния момент, в който влиза ударът.
python3 -I assemble2.py song48.wav out.wav sync.json"""
import sys, wave, json, numpy as np
SRC, OUT, SYNC = sys.argv[1:4]
w = wave.open(SRC); sr = w.getframerate(); ch = w.getnchannels()
x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float).reshape(-1, ch) / 32768
mono = x.mean(axis=1)
G = 4 * 60 / 140.08                       # решетката на песента (за намиране на приблизителното място)
VBAR = 4 * 60 / 140; DUR = 30 * VBAR + 2.0
k = sr // 1000
env = np.sqrt(np.add.reduceat(mono ** 2, np.arange(0, len(mono), k)) / k)      # RMS на 1 ms
def onset(bar, verbose=True):
    """Моментът, в който влиза ударът около такт `bar`: най-стръмното покачване на силата (лог, 15 ms) в [−350, +120] ms."""
    g = int(bar * G * 1000); a, z = g - 350, g + 120
    le = np.log(np.convolve(env, np.ones(8) / 8, 'same') + 1e-5)
    d = le[a + 15:z + 15] - le[a:z]
    order = np.argsort(d)[::-1]
    picks = []
    for i in order:
        if all(abs(i - j) > 40 for j in picks): picks.append(i)
        if len(picks) == 3: break
    if verbose: print(f'  bar {bar}: candidates', [(a + i - g, round(float(d[i]), 2)) for i in picks])
    return (a + picks[0]) / 1000
# runs: (видео такт, такт от песента, котва = такт в рамките на run-а, чийто удар пада точно на видео такта)
RUNS = [(0, 12, 12, 1), (1, 15, 16, 6), (7, 23, 24, 7), (14, 46, None, 1), (15, 48, 48, 4), (19, 63, 64, 6), (25, 72, 72, 1), (26, 79, 80, 3), (29, 90, 90, None)]
N = int(DUR * sr); out = np.zeros((N, ch)); XF = int(.015 * sr)
report = []
for vbar, sbar, anchor, nbars in RUNS:
    if anchor is None:
        src0 = sbar * G                                   # тих такт: без котва, по решетката
        anchor_dst = vbar * VBAR
    else:
        oa = onset(anchor)
        src0 = oa - (anchor - sbar) * G                   # началото на run-а спрямо удара
        report.append((anchor, round((oa - anchor * G) * 1000)))
    dst0 = vbar * VBAR
    length = (nbars * VBAR) if nbars else (DUR - dst0)
    # източникът започва малко преди такта, за да не се изреже предварителният удар (pickup)
    pre = .12 if anchor is not None else 0.0
    a = int((src0 - pre) * sr); n = int((length + pre) * sr) + XF; d = int((dst0 - pre) * sr)
    seg = x[max(0, a):a + n].copy()
    env_w = np.ones(len(seg)); f = min(XF, len(seg)); env_w[:f] = np.linspace(0, 1, f)
    if nbars: env_w[-XF:] = np.minimum(env_w[-XF:], np.linspace(1, 0, XF))
    seg *= env_w[:, None]
    d0 = max(0, d); seg = seg[d0 - d:]; m = min(len(seg), N - d0)
    out[d0:d0 + m] += seg[:m]
fade = int(.6 * sr); out[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
out /= np.abs(out).max() / .89
with wave.open(OUT, 'wb') as o:
    o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr); o.writeframes((out * 32767).astype('<i2').tobytes())
print('drop onsets vs 140.08 grid (ms):', report)
# удари за тресенето на камерата: прагове върху нискочестотната енергия на готовия микс
m2 = out.mean(axis=1); a = np.exp(-2 * np.pi * 150 / sr); y = np.empty_like(m2); acc = 0.0
for i in range(len(m2)):
    acc = (1 - a) * m2[i] + a * acc; y[i] = acc
h = int(.005 * sr); e = np.sqrt(np.add.reduceat(y ** 2, np.arange(0, len(y), h)) / h)
on = np.maximum(0, np.diff(np.log1p(e * 50))); thr = np.percentile(on, 97.5); ks = []
for i in range(1, len(on) - 1):
    if on[i] > thr and on[i] >= on[i - 1] and on[i] >= on[i + 1]:
        t = (i + 1) * h / sr
        if ks and t - ks[-1][0] < .18:
            if on[i] > ks[-1][1]: ks[-1] = [t, on[i]]
            continue
        ks.append([t, on[i]])
mx = np.percentile([v for _, v in ks], 95)
json.dump({'source': 'suno', 'kicks': [[round(t, 3), round(float(np.clip(.45 + 1.1 * v / mx, .45, 1.6)), 2)] for t, v in ks]}, open(SYNC, 'w'))
print('kicks', len(ks), 'duration', round(DUR, 2))
