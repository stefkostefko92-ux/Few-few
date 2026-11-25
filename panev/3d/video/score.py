"""The music of the mounting video, written here (owner, 24.11.2026: our own, calm and technical): 90 BPM, so every
whole second lands on an eighth and every step card on the beat grid. D major, I–vi–IV–V in two-bar chords (Dmaj9,
Bm9, Gmaj9, A6/9). It grows with the work: pad and electric piano for steps 1–3, a soft pulse from the drilling (30 s),
the full groove from the ratchet (48 s), a counter-melody for the levelling (67 s). The cutting (112 s) drops to a held
pulse under the grinder (Em9 – Gmaj9♯11 – A7sus4) and resolves on Dmaj9 with the finished sill (127 s).
Each step card gets a swell into it and a bell on it. render(n) → stereo music, dry and reverb together."""
import numpy as np
from dsp import SR, ns, times, noise, mtof, lowpass, highpass, band, shape, sweep, saw, place, reverb_ir, convolve
from timeline import STEPS, DURATION

BEAT = 60 / 90.0
BAR = 4 * BEAT
CARDS = [a for a, _ in STEPS]           # 4, 13, 21 … 112: the step cards
CUT, FINAL = STEPS[-1]                  # the cutting (112 s, bar 42) and the finished sill (127 s, hero shot)
SLOTS = round(CUT / (2 * BAR))          # two-bar chords up to the cutting
CH = {  # bass, pad voicing, arpeggio tones, upper tones (counter-melody, bells)
    "D": (38, (54, 57, 61, 64), (62, 66, 69, 73, 76), (76, 73, 69)),
    "Bm": (35, (54, 57, 61, 62), (59, 62, 66, 69, 73), (73, 69, 66)),
    "G": (43, (54, 57, 59, 62), (59, 62, 67, 69, 74), (74, 71, 66)),
    "A": (45, (52, 54, 59, 61), (61, 64, 66, 69, 71), (73, 71, 66)),
    "Em": (40, (54, 55, 59, 62), (59, 62, 66, 67, 71), (71, 67, 66)),
    "Gl": (43, (54, 57, 61, 62), (59, 62, 66, 69, 73), (73, 69, 66)),
    "Asus": (45, (52, 55, 57, 62), (57, 62, 64, 67, 69), (69, 67, 64)),
    "Dend": (38, (50, 54, 57, 61, 64, 69), (62, 66, 69, 73, 76, 81), (81, 78, 76)),
}
CHORDS = [(2 * k * BAR, 2 * (k + 1) * BAR, "D Bm G A".split()[k % 4]) for k in range(SLOTS)] + \
    [(CUT, CUT + 2 * BAR, "Em"), (CUT + 2 * BAR, CUT + 4 * BAR, "Gl"), (CUT + 4 * BAR, FINAL, "Asus"),
     (FINAL, DURATION, "Dend")]
CUTOFF = [(0, 500), (3.5, 1300), (4, 1600), (29.5, 2000), (30, 2400), (47.5, 2800), (48, 3300), (83.5, 3500),
          (84, 4100), (CUT - 0.5, 4300), (CUT, 900), (CUT + 12, 2400), (FINAL, 5200), (FINAL + 2.5, 2600), (DURATION, 1100)]


def chord_at(t):
    return next((c for a, b, c in CHORDS if a <= t < b), "Dend")


def ep(m, dur, vel):
    """Electric piano (FM 1:1 with a decaying index, plus a 1:14 tine at the attack)."""
    f = mtof(m)
    t = times(ns(dur + 1.4))
    idx = (0.5 + 1.7 * vel) * np.exp(-t / 0.4) + 0.2
    tone = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    tine = np.sin(2 * np.pi * f * t + 1.5 * vel * np.exp(-t / 0.012) * np.sin(2 * np.pi * 14 * f * t))
    env = np.minimum(1.0, t / 0.003) * np.exp(-6.91 * t / (5.0 * (110 / f) ** 0.35))
    off = np.clip(1 - (t - dur) / 0.35, 0, 1) ** 2
    return (0.8 * tone + 0.2 * tine) * env * off * vel


def pad(notes, dur, seed):
    """Two detuned band-limited saws per note and side, slow drift; 1 s in, 2 s out."""
    rng = np.random.default_rng(seed)
    n = ns(dur + 2.2)
    t = times(n)
    out = np.zeros((2, n))
    for k, m in enumerate(notes):
        for ch in (0, 1):
            for d in (-1, 1):
                cents = d * (6 + 3 * ch) + rng.uniform(-1.5, 1.5)
                drift = 1 + 0.0015 * np.sin(2 * np.pi * (0.11 + 0.04 * k + 0.02 * ch) * t + rng.uniform(0, 6.3))
                out[ch] += saw(mtof(m) * 2 ** (cents / 1200) * drift, seed * 31 + k * 4 + ch * 2 + d)
    env = np.sin(np.pi / 2 * np.minimum(1, t / 1.0)) ** 2 * np.cos(np.pi / 2 * np.clip((t - dur) / 2.0, 0, 1)) ** 2
    return out * env / (2 * len(notes))


def bass(m, dur, vel):
    f = mtof(m)
    t = times(ns(dur + 0.2))
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.008) * np.exp(-t / (1.5 * dur + 0.6)) * np.clip(1 - (t - dur) / 0.12, 0, 1)
    return np.tanh(1.3 * y * env) * vel


def kick(vel, seed):
    t = times(ns(0.6))
    y = np.sin(2 * np.pi * np.cumsum(46 + 70 * np.exp(-t / 0.04)) / SR) * np.exp(-6.91 * t / 0.45)
    y[:ns(0.004)] += 0.15 * shape(noise(ns(0.004), seed), lambda f: lowpass(f, 4000))
    return np.tanh(1.5 * y) * vel


def snap(vel, seed):
    t = times(ns(0.3))
    y = shape(noise(len(t), seed), lambda f: band(f, 1300, 6500)) * np.exp(-6.91 * t / 0.11)
    return (0.5 * y + 0.25 * np.sin(2 * np.pi * 1750 * t) * np.exp(-6.91 * t / 0.03)) * vel


def shaker(vel, seed):
    t = times(ns(0.09))
    y = shape(noise(len(t), seed), lambda f: band(f, 5000, 12000, 3))
    return y * np.minimum(1, t / 0.006) * np.exp(-6.91 * t / 0.07) * vel


def pluck(m, vel, seed):
    f, t = mtof(m), times(ns(1.6))
    rng = np.random.default_rng(seed)
    y = sum(np.sin(2 * np.pi * k * f * t + rng.uniform(0, 6.3)) * np.exp(-6.91 * t / (1.3 / (1 + 0.6 * k))) / k ** 1.3
            for k in range(1, 9) if k * f < 16000)
    return y * np.minimum(1, t / 0.002) * vel


def bell(m, vel, seed):
    f, t = mtof(m), times(ns(3.6))
    rng = np.random.default_rng(seed)
    parts = ((1, 1.0, 3.2), (2.0, 0.3, 1.8), (3.0, 0.1, 1.0), (4.16, 0.16, 0.7), (5.43, 0.07, 0.45))
    y = sum(a * np.sin(2 * np.pi * r * f * t + rng.uniform(0, 6.3)) * np.exp(-6.91 * t / d) for r, a, d in parts)
    return y * np.minimum(1, t / 0.002) * vel


def swell(dur, seed):
    """Air rising into a step card: band noise, its top opening, cut on the card."""
    n = ns(dur)
    t = times(n)
    y = np.stack([shape(noise(n, seed + c), lambda f: band(f, 300, 7000, 1)) for c in (0, 1)])
    y = sweep(y, lambda s: 600 + 9000 * np.clip(s / dur, 0, 1) ** 2)
    return y * (t / dur) ** 3 * np.clip((dur - t) / 0.02, 0, 1)


def notes():
    """Every note: (instrument, start s, length s, midi, velocity, pan)."""
    rng = np.random.default_rng(7)
    out = [("ep", 1 / 3, 3.4, m, 0.42, 0.0) for m in (50, 57, 62, 66, 69)]
    out += [("ep", t, 0.6, m, 0.4, 0.15) for t, m in ((2.0, 73), (8 / 3, 69), (10 / 3, 76))]
    pat = (0, 2, 3, 4, 3, 2, 1, 2, 0, 2, 4, 3, 2, 3, 1, 2)
    acc = (1.0, 0.55, 0.7, 0.6, 0.85, 0.55, 0.7, 0.6)
    for a, b, c in CHORDS:
        root, _, arp, top = CH[c]
        for i in range(16):
            t = a + i * BEAT / 2
            if not (CARDS[0] <= t < CUT and t < b):
                continue
            if t < 30 and i % 8 not in (0, 3, 4, 6):
                continue
            j = t + rng.normal(0, 0.004)
            out.append(("ep", j, 0.3, arp[pat[i]], (0.5 if t < 30 else 0.42) * acc[i % 8] * rng.uniform(0.9, 1.05),
                        rng.uniform(-0.25, 0.25)))
        if 67 <= a < CUT:
            for beat, k in ((0, 0), (1.5, 1), (3, 2), (5, 1), (6.5, 2)):
                out.append(("pluck", a + beat * BEAT, 0.5, top[k] + 12 * (k == 0 and c != "D"), 0.6, 0.35))
        if CARDS[0] < b and a < 30:  # steps 1–3: one held root per chord
            s0 = max(a, CARDS[0])
            out.append(("bass", s0, b - s0 - 0.1, root, 0.55, 0))
        for bar in range(2):
            s = a + bar * BAR
            if not 30 <= s < CUT:
                continue
            for beat, d, up in ((0, 1.25, 0), (1.5, 0.4, 0), (2.5, 1.25, 0), (3.5, 0.4, 12 * (s >= 48))):
                out.append(("bass", s + beat * BEAT, d * BEAT, root + up, 0.62, 0))
            for beat in (0, 2):
                out.append(("kick", s + beat * BEAT, 0, 0, 0.8, 0))
            for beat in (1, 3) if s >= 48 else ():
                out.append(("snap", s + beat * BEAT, 0, 0, 0.7, -0.1))
            for k in range(16):
                out.append(("shaker", s + k * BEAT / 4, 0, 0, (0.3 if k % 2 == 0 else 0.16) * rng.uniform(0.8, 1), 0.45))
    for a, b, c in CHORDS[SLOTS:SLOTS + 3]:  # the cutting: a held pulse, louder towards the end
        k = 0
        while a + k * BEAT / 2 < b - 0.01:
            t = a + k * BEAT / 2
            out.append(("bass", t, BEAT * 0.4, CH[c][0], 0.3 + 0.35 * (t - CUT) / (FINAL - CUT), 0))
            if k % 4 == 0:
                out.append(("ep", t, 0.5, CH[c][2][4 - (k // 4) % 2], 0.3, rng.uniform(-0.2, 0.2)))
            k += 1
    out += [("ep", FINAL + i * BEAT / 2, 4.5 - i * BEAT / 2, m, 0.5 - 0.04 * i, 0.3 * (i % 2 * 2 - 1))
            for i, m in enumerate(CH["Dend"][2])]
    out += [("bass", FINAL, 5.4, 38, 0.6, 0), ("boom", FINAL, 0, 0, 0.55, 0)]
    for t in CARDS + [FINAL]:
        out.append(("bell", t, 0, CH[chord_at(t + 0.01)][3][0] + 12, 0.7, rng.uniform(-0.2, 0.2)))
    out += [("bell", 1 / 3, 0, 86, 0.6, -0.1), ("bell", 1 / 3 + BEAT, 0, 81, 0.45, 0.15)]
    return out


def render(n):
    buses = {k: np.zeros((2, n)) for k in ("pad", "ep", "bass", "drums", "pluck", "bell", "swell")}
    t = times(n)
    for i, (kind, s, d, m, v, p) in enumerate(notes()):
        if v <= 0:
            continue
        if kind == "ep":
            place(buses["ep"], s, ep(m, d, v), 1.0, p)
        elif kind == "bass":
            place(buses["bass"], s, bass(m, d, v))
        elif kind == "pluck":
            place(buses["pluck"], s, pluck(m, v, i), 1.0, p)
        elif kind == "bell":
            place(buses["bell"], s, bell(m, v, i), 1.0, p)
        elif kind == "boom":
            tt = times(ns(2.5))
            place(buses["drums"], s, np.sin(2 * np.pi * np.cumsum(36 + 19 * np.exp(-tt / 0.3)) / SR) * np.exp(-6.91 * tt / 2.5) * v)
        else:
            place(buses["drums"], s, {"kick": kick, "snap": snap, "shaker": shaker}[kind](v, i), 1.0, p)
    for k, (a, b, c) in enumerate(CHORDS):
        place(buses["pad"], a, pad(CH[c][1], b - a, 100 + k))
    for c in CARDS[1:] + [FINAL]:
        place(buses["swell"], c - 1.3, swell(1.3, 900 + int(c)), 0.7 if c < FINAL else 1.0)
    place(buses["swell"], FINAL - 2.6, swell(2.6, 991), 0.8)
    xs, ys = zip(*CUTOFF)
    buses["pad"] = sweep(buses["pad"], lambda s: np.exp(np.interp(s, xs, np.log(ys))))
    kicks = [s for kind, s, _, _, v, _ in notes() if kind == "kick" and v > 0 and s >= 48]
    pump = np.ones(n)
    for s in kicks:  # the pad breathes with the kick in the full groove
        i = ns(s)
        pump[i:i + ns(0.5)] *= 1 - 0.22 * np.exp(-times(min(ns(0.5), n - i)) / 0.16)
    buses["pad"] *= pump * np.interp(t, (0, 2.5, CUT, CUT + 1, FINAL, FINAL + 1), (0, 1, 1, 0.85, 0.85, 1.1))
    buses["ep"] *= np.stack([1 + 0.12 * np.sin(2 * np.pi * 4.2 * t), 1 - 0.12 * np.sin(2 * np.pi * 4.2 * t)])
    lvl = {"pad": 0.55, "ep": 0.26, "bass": 0.25, "drums": 0.32, "pluck": 0.1, "bell": 0.08, "swell": 0.05}
    send = {"pad": 0.3, "ep": 0.3, "bass": 0.0, "drums": 0.12, "pluck": 0.45, "bell": 0.55, "swell": 0.25}
    dry = sum(buses[k] * lvl[k] for k in buses)
    wet = convolve(sum(buses[k] * lvl[k] * send[k] for k in buses), reverb_ir(2.4, 0.025, 4242, hf=0.4))
    out = dry + 0.5 * wet
    out = shape(out, lambda f: highpass(f, 30, 2))
    return out * np.interp(t, (0, DURATION - 1.8, DURATION - 0.05, DURATION), (1, 1, 0, 0)) ** 2


if __name__ == "__main__":
    import sys
    from dsp import write_wav
    y = render(ns(DURATION))
    write_wav(sys.argv[1] if len(sys.argv) > 1 else "music.wav", y / max(1e-9, np.max(np.abs(y))) * 0.7)
