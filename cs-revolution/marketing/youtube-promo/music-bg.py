#!/usr/bin/env python3
"""Музиката на българския промо клип — синтезирана от нулата (без семпли, без чужди права).

140 BPM, 30 такта (51,43 s) + 2 s отзвук. Мрежата на тактовете е същата като в composition-bg.html:
всеки удар, преход и пауза в картината пада точно на удар в музиката.

  python3 music-bg.py out/music-bg.wav        # нужни: Python 3 + numpy
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 140
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 30
TAIL = 2.0
N = int((BARS * BAR + TAIL) * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def at(t):
    return int(round(t * SR))


def add(sig, t, gain=1.0, pan=0.0):
    i = at(t)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * (1 - max(0, pan))
    R[i:i + len(sig)] += sig * gain * (1 + min(0, pan))


def env(n, a, d):
    """Атака a и експоненциален спад d (секунди) за n семпъла."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def lp(x, cut):
    """Едноплюсов нискочестотен филтър (cut може да е масив)."""
    y = np.empty_like(x)
    a = np.exp(-2 * np.pi * np.asarray(cut, dtype=float) / SR) * np.ones_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def hp(x):
    return np.diff(x, prepend=0)


# ── инструменти ──────────────────────────────────────────────────────────────
def kick(drive=3.0, length=0.45):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, 0.001, 0.16)
    s[: int(0.004 * SR)] += rng.uniform(-1, 1, int(0.004 * SR)) * 0.6        # клик
    return np.tanh(s * drive) / np.tanh(drive)


def snare(length=0.28):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = hp(rng.uniform(-1, 1, n)) * env(n, 0.001, 0.09)
    body = np.sin(2 * np.pi * 185 * t) * env(n, 0.001, 0.05)
    return np.tanh((noise * 0.9 + body * 0.7) * 2.2)


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    x = hp(hp(rng.uniform(-1, 1, n)))
    return x * env(n, 0.0005, 0.07 if open_ else 0.012)


def impact(length=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 30 + 70 * np.exp(-t / 0.25)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.7)
    crash = lp(rng.uniform(-1, 1, n), 5000) * env(n, 0.001, 0.35)
    return np.tanh((boom * 1.6 + crash * 0.5) * 1.8)


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    k = t / length
    noise = lp(rng.uniform(-1, 1, n), 300 + 9000 * k ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * k ** 2) / SR) * 0.25
    return (noise * 0.8 + tone) * k ** 2


def whoosh(length=0.5):
    n = int(length * SR)
    k = np.linspace(0, 1, n)
    noise = lp(rng.uniform(-1, 1, n), 800 + 6000 * np.sin(np.pi * k))
    return noise * np.sin(np.pi * k) ** 2


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f * (1 + detune)) % 1) - 1


def bass(freq, length, cut=420):
    n = int(length * SR)
    x = saw(freq, n, -0.006) + saw(freq, n, 0.006) + 0.6 * np.sin(2 * np.pi * freq / 2 * np.arange(n) / SR)
    x = lp(x, cut) * env(n, 0.004, length * 0.9)
    return np.tanh(x * 1.6)


def drone(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = saw(41.2, n, -0.004) + saw(41.2, n, 0.004) + 0.5 * saw(61.7, n)
    x = lp(x, 120 + 500 * (t / length) ** 2)
    return x * np.minimum(1, t / 0.6)


# ── аранжимент (тактове) ─────────────────────────────────────────────────────
KICK, SNARE, HAT, OHAT = kick(), snare(), hat(), hat(True)
IMP = impact()
duck = np.ones(N)


def k(t, g=1.0):
    add(KICK, t, 0.95 * g)
    i = at(t)
    d = 1 - 0.65 * np.exp(-np.arange(min(N - i, int(0.3 * SR))) / SR / 0.09)
    duck[i:i + len(d)] = np.minimum(duck[i:i + len(d)], d)


def full_bar(b, hats16=False, snares=True):
    t0 = b * BAR
    for q in range(4):
        k(t0 + q * BEAT)
        if snares and q in (1, 3):
            add(SNARE, t0 + q * BEAT, 0.55)
    for e in range(16 if hats16 else 8):
        step = BEAT / (4 if hats16 else 2)
        add(HAT, t0 + e * step, 0.16 if e % 2 else 0.22, pan=0.35 if e % 2 else -0.35)
    add(OHAT, t0 + 3.5 * BEAT, 0.14, pan=0.2)


# 0–2: студено начало — дрон, удари само под думите
add(drone(2 * BAR + 0.2), 0, 0.30)
for beat in (0, 2, 4, 6):
    k(beat * BEAT, 1.1)
    add(IMP[: int(0.6 * SR)], beat * BEAT, 0.35)
add(riser(BAR), BAR, 0.45)

# удари на големите преходи
DROPS = [2, 8, 14.5, 20, 27]
for b in DROPS:
    add(IMP, b * BAR, 0.75)
for b in (7, 13, 19, 26):
    add(riser(BAR), b * BAR, 0.4)

# 2–14: пълен бит (портфолиото с 16-ти хай-хети)
for b in range(2, 14):
    full_bar(b, hats16=(10 <= b < 14))

# 14: AdBlock — „Тази реклама…“ тишина два удара, после удар и бит
k(14 * BAR, 1.2)
add(IMP[: int(0.8 * SR)], 14 * BAR, 0.5)
full_bar(15)
for b in range(16, 20):
    full_bar(b)
# 20–25: истинските проекти — пълен бит, 16-ти
for b in range(20, 25):
    full_bar(b, hats16=True)
# 25–27: доказателства — половин темпо (удар на 1 и 3)
for b in (25, 26):
    for q in (0, 2):
        k(b * BAR + q * BEAT)
    add(SNARE, b * BAR + 2 * BEAT, 0.6)
# 27–30: финал
for b in (27, 28):
    full_bar(b)
k(29 * BAR, 1.2)
add(IMP, 29 * BAR, 0.9)

# бас — рифът в ми минор под пълните тактове (дишa с удара)
RIFF = [41.2, 41.2, 49.0, 36.7]          # E1 E1 G1 D1, по един такт
for b in list(range(2, 14)) + list(range(15, 25)) + [27, 28]:
    f = RIFF[b % 4]
    for q in range(4):
        add(bass(f, BEAT * 0.92), b * BAR + q * BEAT, 0.3)
for b in (25, 26):
    add(bass(41.2, 2 * BAR * 0.98, cut=260), b * BAR, 0.38)

# вълни на всеки рязък преход в картината (по 2 удара в монтажа на проектите)
for b in range(4, 8):
    for q in (0, 2):
        add(whoosh(0.35), b * BAR + q * BEAT - 0.18, 0.12, pan=-0.4 if q else 0.4)
for i in range(10):
    add(whoosh(0.4), 20 * BAR + i * 2 * BEAT - 0.2, 0.14, pan=0.5 if i % 2 else -0.5)

# ── мастер ───────────────────────────────────────────────────────────────────
mix = np.stack([L, R])
mix *= 0.8 + 0.2 * duck                     # лекото „помпане“ на жанра под всеки удар
# мек лимитер: 99,7-ият персентил отива на 0,8, tanh закръгля само върховете (без тухлена стена);
# крайната сила на звука (−14 LUFS, стандартът на YouTube) се прави при сглобяването с loudnorm
mix = np.tanh(mix / np.percentile(np.abs(mix), 99.7) * 0.8)
fade = np.ones(N)
fade[-at(1.2):] = np.linspace(1, 0, at(1.2))
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89                                         # ≈ −1 dBFS
pcm = (mix.T * 32767).astype("<i2")
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "music-bg.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"music: {N / SR:.2f} s, {BPM} BPM, {BARS} такта")
