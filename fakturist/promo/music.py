#!/usr/bin/env python3
"""Музиката на промо клипа на Фактурист — синтезирана от нулата (без семпли, без чужди права).

104 BPM, 43 такта + 2,5 s отзвук. Мрежата на тактовете е същата като в promo/film-lib.js: всеки преход в
картината пада на удар. Хармонията: си минор — сол — ре — ла (vi–IV–I–V в ре мажор), спокойно и светло.

  python3 promo/music.py dist/promo/music.wav        # нужни: Python 3 + numpy
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 43
TAIL = 2.5
N = int((BARS * BAR + TAIL) * SR)
rng = np.random.default_rng(16)
L = np.zeros(N)
R = np.zeros(N)


def at(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def idx(t):
    return int(round(t * SR))


def add(sig, t, gain=1.0, pan=0.0):
    i = idx(t)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * (1 - max(0.0, pan))
    R[i:i + len(sig)] += sig * gain * (1 + min(0.0, pan))


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def tone(f, n, partials=1, roll=1.0, detune=0.0):
    """Сбор от синусоиди (хармоници с наклон 1/k^roll) — мек тембър без филтри."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, partials + 1):
        out += np.sin(2 * np.pi * f * k * (1 + detune) * t + k * 0.7) / k ** roll
    return out


# ── инструменти ──────────────────────────────────────────────────────────────────────────────────
def pad(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.004, 0.0, 0.0045):
            x += tone(f, n, partials=6, roll=1.6, detune=d)
    shape = np.minimum(1, t / 0.9) * np.minimum(1, (length - t) / 0.8).clip(0, 1)
    wobble = 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    return x * shape * wobble / (len(freqs) * 3)


def pluck(f, length=0.9):
    n = int(length * SR)
    x = tone(f, n, partials=4, roll=1.9) * env(n, 0.003, 0.22)
    x += 0.25 * tone(2 * f, n, partials=1) * env(n, 0.001, 0.06)
    return x


def bell(f, length=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.4)
    return x * env(n, 0.002, 0.9)


def bass(f, length):
    n = int(length * SR)
    x = tone(f, n, partials=3, roll=2.2) * np.minimum(1, np.arange(n) / SR / 0.01)
    x *= np.exp(-np.arange(n) / SR / (length * 1.4))
    return np.tanh(x * 1.4)


def kick(length=0.42):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.14)
    return np.tanh(s * 2.2) / np.tanh(2.2)


def hat(length=0.06):
    n = int(length * SR)
    x = np.diff(np.diff(rng.uniform(-1, 1, n + 2)))
    return x * env(n, 0.0005, 0.015)


def clap():
    n = int(0.22 * SR)
    x = np.diff(rng.uniform(-1, 1, n + 1)) * env(n, 0.001, 0.07)
    return x * 0.7


def swell(length):
    """Нарастващ шум + тон преди преход (без филтър: висок шум се смесва постепенно)."""
    n = int(length * SR)
    k = np.linspace(0, 1, n)
    noise = rng.uniform(-1, 1, n)
    smooth = np.convolve(noise, np.ones(24) / 24, mode='same')
    x = smooth * (1 - k) + noise * k * 0.5
    x += 0.25 * np.sin(2 * np.pi * np.cumsum(220 + 660 * k ** 2) / SR)
    return x * k ** 2.2


def impact(length=2.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(32 + 60 * np.exp(-t / 0.22)) / SR) * env(n, 0.002, 0.8)
    air = np.convolve(rng.uniform(-1, 1, n), np.ones(6) / 6, mode='same') * env(n, 0.001, 0.4)
    return np.tanh((boom * 1.4 + air * 0.35) * 1.5)


# ── хармонията ──────────────────────────────────────────────────────────────────────────────────
CHORDS = [  # (бас, тонове на подложката, арпеджио)
    (61.74, [246.94, 293.66, 369.99], [493.88, 587.33, 739.99, 987.77]),   # си минор
    (49.00, [196.00, 246.94, 293.66], [392.00, 493.88, 587.33, 783.99]),   # сол
    (73.42, [293.66, 369.99, 440.00], [587.33, 739.99, 880.00, 1174.66]),  # ре
    (55.00, [220.00, 277.18, 329.63], [440.00, 554.37, 659.26, 880.00]),   # ла
]
ARP = [0, 1, 2, 3, 2, 1, 3, 2]

beat_on = set(range(8, 35)) | set(range(37, 40))       # тактовете с бит
full = set(range(12, 35)) | set(range(37, 40))         # с хай-хет и плясък
for b in range(BARS):
    bass_f, pad_f, arp_f = CHORDS[b % 4]
    add(pad(pad_f, BAR + 0.9), at(b), 0.44 if b < 40 else 0.38, pan=0.0)
    if 4 <= b < 41:
        for i, step in enumerate(ARP):
            g = 0.13 if b < 8 else 0.11
            add(pluck(arp_f[step]), at(b, i * 0.5), g, pan=-0.35 if i % 2 else 0.35)
            add(pluck(arp_f[step]), at(b, i * 0.5) + 0.27, g * 0.35, pan=0.5 if i % 2 else -0.5)  # ехо
    if b in beat_on:
        for q in range(4):
            if b in full or q in (0, 2):
                add(kick(), at(b, q), 0.55)
            add(bass(bass_f, BEAT * 0.95), at(b, q), 0.26)
    if b in full:
        for e in range(8):
            add(hat(), at(b, e * 0.5), 0.05 if e % 2 else 0.03, pan=0.3 if e % 2 else -0.3)
        for q in (1, 3):
            add(clap(), at(b, q), 0.14)

# камбани под логото и под призива
for b, notes in ((0, [987.77, 1174.66]), (2, [1479.98]), (40, [987.77, 1479.98]), (42, [1174.66])):
    for i, f in enumerate(notes):
        add(bell(f), at(b, i * 1.5), 0.10, pan=0.2 * (-1) ** i)
# преходите: нарастване преди и удар на първия такт на сцената
for b in (4, 8, 12, 18, 21, 24, 28, 32, 35, 37, 40):
    add(swell(BAR * 0.5), at(b) - BAR * 0.5, 0.07)
for b in (12, 28, 37, 40):
    add(impact(), at(b), 0.42)
# финален акорд — ре мажор, задържан
add(pad([293.66, 369.99, 440.00, 587.33], 4.5), at(42, 2), 0.32)

# ── мастер ───────────────────────────────────────────────────────────────────────────────────────
mix = np.stack([L, R])
mix = np.tanh(mix / np.percentile(np.abs(mix), 99.8) * 0.75)
fade = np.ones(N)
fade[-idx(2.0):] = np.linspace(1, 0, idx(2.0))
fade[: idx(0.4)] = np.linspace(0, 1, idx(0.4))
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix.T * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'music: {N / SR:.2f} s, {BPM} BPM, {BARS} такта')
