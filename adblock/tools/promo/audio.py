#!/usr/bin/env python3
"""Звукът на промо клипа — генериран от код, като в boy/ (без записи, без лицензи).

Дъжд (филтриран шум, стерео), нисък дрон в ла минор, гръмотевица след всеки удар от
timeline.json (близкият удар — пукот почти веднага и дълъг тътен; далечният — само тътен,
по-късно). 48 kHz, 16 бита, стерео; пик −1 dBFS. Изисква numpy.
"""
import json, os, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "timeline.json")))
SR, DUR = 48000, TL["duration"]
N = int(SR * DUR)
rng = np.random.default_rng(0x5A17)

def band(x, lo, hi):
    """Band-pass by FFT (brick-wall with soft edges) — fast and exact enough for texture."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.clip((f - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1) if lo > 0 else np.ones_like(f)
    g *= np.clip((hi * 1.3 - f) / (hi * 0.3), 0, 1)
    return np.fft.irfft(X * g, len(x))

t = np.arange(N) / SR
fade_in = np.clip(t / 2.5, 0, 1)
fade_out = np.clip((DUR - t) / 1.6, 0, 1)
out = np.zeros((N, 2))

# rain: two decorrelated noise beds + sparse droplets
for ch in range(2):
    r = band(rng.standard_normal(N), 400, 9000) * 0.05 + band(rng.standard_normal(N), 90, 600) * 0.03
    drops = np.zeros(N); idx = rng.integers(0, N, int(DUR * 90)); drops[idx] = rng.uniform(0.2, 1, len(idx))
    drops = band(drops, 1500, 7000) * 0.35
    out[:, ch] += (r + drops) * fade_in * fade_out

# drone: A minor, slow swell, a little detune per channel
swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 24 - 1.2)
for f, a in ((55, 0.10), (82.41, 0.05), (110, 0.05), (130.81, 0.025), (164.81, 0.02)):
    for ch, d in ((0, 0.997), (1, 1.003)):
        out[:, ch] += a * np.sin(2 * np.pi * f * d * t + ch) * swell * fade_in * fade_out
# the end card: the chord opens up
end = np.clip((t - TL["scenes"][-2]) / 2.0, 0, 1) * fade_out
for f in (220, 261.63, 329.63):
    out[:, 0] += 0.018 * np.sin(2 * np.pi * f * t) * end
    out[:, 1] += 0.018 * np.sin(2 * np.pi * f * 1.002 * t) * end

# thunder
for s in TL["strikes"]:
    p = s["p"]; near = p >= 0.9
    t0 = s["t"] + (0.14 if near else 0.55)
    L = int(SR * (4.2 if near else 3.2)); i0 = int(t0 * SR)
    if i0 >= N: continue
    L = min(L, N - i0); tt = np.arange(L) / SR
    rumble = band(rng.standard_normal(L), 25, 190 if near else 130)
    wob = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * tt * 1.3 + rng.uniform(0, 6))) * np.abs(np.sin(2 * np.pi * tt * 0.47 + rng.uniform(0, 6)))
    envl = (1 - np.exp(-tt / 0.06)) * np.exp(-tt / (1.3 if near else 1.0)) * wob
    snd = rumble / (np.abs(rumble).max() + 1e-9) * envl * (0.9 if near else 0.55) * p
    if near:  # the crack: a short bright tearing burst on top
        c = band(rng.standard_normal(L), 900, 8000) * np.exp(-tt / 0.09) * (tt < 0.5)
        snd += c / (np.abs(c).max() + 1e-9) * 0.35 * p
    pan = (s["x"] / TL["width"]) * 0.6 + 0.2
    out[i0:i0 + L, 0] += snd * (1 - pan) * 1.4
    out[i0:i0 + L, 1] += snd * pan * 1.4

out = np.tanh(out * 1.2)                       # soft limiter
out *= 10 ** (-1 / 20) / np.abs(out).max()     # peak −1 dBFS
pcm = (out * 32767).astype("<i2")
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "audio.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("audio", path, f"{DUR}s")
