"""The tool sounds of the mounting videos, shared by the films (each film's sfx.py places them on its own frames).
All synthesised: struck parts are damped modes, contacts filtered noise, the motors their harmonics. The ratchet clicks
once per tooth (72 teeth, 5°) on every back stroke; the rotary hammer's blows follow the motor; the grinder starts, slows
under the cut, crackles with the sparks and runs down. Every noise is seeded, so a run repeats itself."""
import numpy as np
from dsp import SR, ns, times, noise, ease, lowpass, band, peak, shape, modal, burst

def conv1(x, k):
    nf = 1 << int(np.ceil(np.log2(len(x) + len(k))))
    return np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(k, nf), nf)[:len(x)]


def norm(x):
    return x / max(1e-9, np.sqrt(np.mean(x * x)))


def roughness(n, rate, seed):
    """A positive random wobble around 1 (stick–slip, the hand's pressure)."""
    w = shape(np.abs(noise(n, seed)), lambda f: lowpass(f, rate, 1))
    return w / max(1e-9, np.mean(w))


def knock(seed):  # a steel bracket meeting the concrete
    return modal((210, 470, 980, 1900), (0.07, 0.05, 0.035, 0.02), (1.0, 0.6, 0.35, 0.15), 0.12, seed) \
        + 0.4 * np.pad(burst(0.03, 150, 2500, 0.012, seed + 1), (0, ns(0.09)))


def tick(seed, scale=1.0):  # small steel parts seating: a bolt head, an anchor's washer
    y = modal(np.array((1500, 3200, 5600)) * scale, (0.05, 0.03, 0.018), (1.0, 0.5, 0.3), 0.07, seed)
    y[:ns(0.01)] += 0.3 * burst(0.01, 2500, 12000, 0.003, seed + 1)
    return y


def clack(seed):  # the aluminium level set down
    y = modal((180, 700, 1600, 3100, 5200), (0.05, 0.08, 0.05, 0.03, 0.015), (0.8, 1.0, 0.6, 0.35, 0.15), 0.12, seed)
    y[:ns(0.015)] += 0.3 * burst(0.015, 1000, 9000, 0.005, seed + 1)
    return y


def clonk(seed):  # the aluminium sill landing on the A plates, with two small bounces
    y = np.zeros(ns(0.7))
    for k, (dt, a) in enumerate(((0, 1.0), (0.05, 0.3), (0.11, 0.12))):
        h = modal((240, 610, 1150, 2300, 3900), (0.35, 0.25, 0.15, 0.08, 0.05), (1.0, 0.7, 0.45, 0.25, 0.12), 0.45, seed + k)
        h[:ns(0.02)] += 0.3 * burst(0.02, 300, 6000, 0.008, seed + 10 + k)
        y[ns(dt):ns(dt) + len(h)] += a * h
    return y


def clink(seed):  # an off-cut hitting the pit floor, far below: bounces, the highs gone
    y = np.zeros(ns(0.8))
    for k, (dt, a) in enumerate(((0, 1.0), (0.13, 0.45), (0.22, 0.2), (0.27, 0.08))):
        h = a * modal((1900, 4400, 7100, 9800), (0.25, 0.15, 0.08, 0.05), (1.0, 0.6, 0.35, 0.15), 0.3, seed + k)
        y[ns(dt):ns(dt) + len(h)] += h
    return shape(y, lambda f: lowpass(f, 3500, 2))


def scrape(dur, lo, hi, seed, grain=100.0):
    """Sliding contact: band noise, rough, as loud as the move is fast (an eased move peaks in the middle)."""
    n = ns(dur)
    speed = np.sin(np.pi * np.clip(times(n) / dur, 0, 1))
    return shape(noise(n, seed), lambda f: band(f, lo, hi)) * roughness(n, grain, seed + 1) * speed


def marker_dot(seed):  # felt tip on rough concrete, through a slot
    n = ns(0.3)
    grit = (np.random.default_rng(seed).random(n) < 400 / SR) * 1.5
    return scrape(0.3, 1200, 6000, seed, 300) * (0.6 + conv1(grit, np.exp(-times(ns(0.004)) / 0.001)))


def marker_line(seed):  # felt tip along the steel plate: a hiss and a faint squeak
    t = times(ns(0.9))
    speed = np.sin(np.pi * t / 0.9)
    squeak = np.sin(2 * np.pi * np.cumsum(2100 + 150 * np.sin(2 * np.pi * 3 * t)) / SR) * 0.12 * speed
    return scrape(0.9, 2000, 7000, seed, 40) + squeak * roughness(len(t), 20, seed + 2)


def stroke_angle(t, a, b, total, n):
    """ratchet.stroke(): the handle's angle (°), 65 % of each stroke forward with the fastener, the rest back alone."""
    per = (b - a) / n
    i = np.floor((t - a) / per)
    u = (t - a - i * per) / per
    fwd = u < 0.65
    k = ease(np.where(fwd, u / 0.65, (u - 0.65) / 0.35))
    ang = np.where(fwd, k, 1 - k) * total / n
    return np.where((t <= a) | (t >= b), 0.0, ang), fwd


def ratchet(put, dry, wet, on, a, b, total, n, off, pan, seed):
    """The socket on, every click and catch of the strokes, the fastener turning, the socket off; put(dry, wet, t, sig,
    gain, pan) is the film's own placing."""
    put(dry, wet, on, modal((1850, 3300, 5200, 7400), (0.06, 0.04, 0.025, 0.015), (1.0, 0.6, 0.4, 0.2), 0.08, seed), 0.6, pan)
    t = np.arange(a, b, 0.00025)
    ang, fwd = stroke_angle(t, a, b, total, n)
    tooth = np.floor(ang / 5.0)
    rng = np.random.default_rng(seed)
    for j in np.nonzero((np.diff(tooth) < 0) & ~fwd[1:])[0]:  # the pawl slips over a tooth: one click
        c = modal((3100, 5300, 7900), (0.014, 0.010, 0.007), (1.0, 0.7, 0.4), 0.02, seed + j, 0.04)
        c[:ns(0.004)] += 0.4 * burst(0.004, 3000, 14000, 0.0015, seed + j + 1)
        put(dry, wet, t[j + 1], c, 0.3 * rng.uniform(0.75, 1.0), pan)
    for j in np.nonzero(np.diff(fwd.astype(int)) > 0)[0]:  # it catches again for the next stroke
        put(dry, wet, t[j + 1], tick(seed + 500 + j, 2.0), 0.18, pan)
    per = (b - a) / n
    for i in range(n):  # the fastener turning under the socket, a little harder each stroke
        put(dry, wet, a + i * per, scrape(0.65 * per, 300, 1800, seed + 700 + i, 60), 0.05 * (1 + 0.5 * i), pan)
    put(dry, wet, off, tick(seed + 900, 1.3), 0.25, pan)


def drill(seed, runs, into, stall):
    """Rotary hammer: the motor's harmonics and fan, hammer blows (~70 a second) and crushed concrete in the wall.
    stall: the moment the bit meets steel — the motor stops within ~0.1 s instead of running down."""
    t0, t1 = runs[0][0] - 0.1, runs[-1][1] + 0.9
    n = ns(t1 - t0)
    t = times(n) + t0
    spd = np.zeros(n)
    for a, b in runs:
        down = 0.05 if stall is not None and abs(b - stall) < 1e-6 else 0.25
        spd = np.maximum(spd, ease((t - a) / 0.15) * np.where(t < b, 1.0, np.exp(-(t - b) / down)))
    load = sum(ease((t - a) / 0.08) - ease((t - b) / (0.01 if stall is not None else 0.06)) for a, b in into)
    f = 290 * spd * (1 - 0.12 * load)
    ph = 2 * np.pi * np.cumsum(f) / SR
    rng = np.random.default_rng(seed)
    motor = sum((np.exp(-((k - 4) / 3) ** 2) + 0.3 / k) * np.sin(k * ph + rng.uniform(0, 6.3)) for k in range(1, 15))
    fan = shape(noise(n, seed), lambda fr: band(fr, 900, 6000)) * spd ** 2
    blows = np.diff(np.floor(np.cumsum(f / 4.2) / SR), prepend=0) > 0
    train = blows * load * rng.uniform(0.7, 1.1, n)
    kern = modal((170, 390, 820, 2300), (0.02, 0.015, 0.01, 0.006), (1.0, 0.7, 0.4, 0.25), 0.03, seed + 1)
    kern[:ns(0.012)] += 0.8 * burst(0.012, 400, 5000, 0.006, seed + 2)
    hammer = conv1(train, kern)
    crunch = shape(noise(n, seed + 3), lambda fr: band(fr, 600, 4000)) * load * (0.3 + conv1(train, np.exp(-times(ns(0.05)) / 0.008)))
    return t0, 0.3 * norm(motor * spd ** 1.5) + 0.15 * norm(fan) + norm(hammer) + 0.3 * norm(crunch)


def rebar_hit(seed):
    """The bit meets the rebar: a dry clang of the bar in the concrete, a short shriek of carbide on steel."""
    n = ns(0.6)
    clang = modal((1150, 2650, 4300, 6900), (0.18, 0.12, 0.07, 0.04), (1.0, 0.7, 0.45, 0.2), 0.6, seed, 0.03)
    t = times(n)
    shriek = shape(noise(n, seed + 1), lambda f: band(f, 2200, 8000) * peak(f, 3600, 10, 0.3)) * np.exp(-t / 0.05)
    thud = modal((140, 310), (0.08, 0.05), (1.0, 0.5), 0.6, seed + 2)
    return 0.6 * norm(clang) * np.exp(-t / 0.2) + 0.5 * norm(shriek) * np.minimum(1, t / 0.003) + 0.4 * norm(thud)


def grinder(start, stop, cuts, seed):
    """Angle grinder: armature ~505 Hz and its harmonics (the gear mesh, 9×, is the whine), the fan, the disc's 1×;
    under the cut it slows 11 % and grinds: hiss, crackle of sparks, the plate ringing. Runs down over ~2.4 s."""
    n = ns(stop + 2.4 - start)
    t = times(n) + start
    load = sum(ease((t - a) / 0.08) - ease((t - b) / 0.06) for a, b in cuts)
    f0 = 505.0
    f = f0 * ease((t - start) / 0.6) ** 0.8 * (1 - 0.11 * load)
    f = np.where(t < stop, f, f0 * np.exp(-(t - stop) / 0.8))
    spd = f / f0
    ph = 2 * np.pi * np.cumsum(f) / SR
    rng = np.random.default_rng(seed)
    tonal = np.zeros(n)
    for k in range(1, 34):
        if k * f0 > 17000:
            break
        a = 0.12 / k + 0.6 * np.exp(-((k * f0 - 3400) / 1500) ** 2) + 0.7 * (k == 9) + 0.25 * (k == 18)
        tonal += a * np.sin(k * ph + rng.uniform(0, 6.3))
    fan = shape(noise(n, seed), lambda fr: band(fr, 700, 10000)) * spd ** 2
    hum = np.sin(ph / 3.3) * spd
    hiss = shape(noise(n, seed + 1), lambda fr: band(fr, 1500, 12000)) * roughness(n, 12, seed + 2)
    sparks = (rng.random(n) < 2200 / SR) * rng.exponential(1.0, n)
    crackle = conv1(sparks, burst(0.003, 3500, 15000, 0.0012, seed + 3))
    ring = shape(noise(n, seed + 4), lambda fr: band(fr, 1800, 9000) * peak(fr, 2600, 14, 0.25) * peak(fr, 4100, 12, 0.2)
                 * peak(fr, 6300, 9, 0.2))
    grind = load * (0.5 * norm(hiss) + 0.6 * norm(crackle) + 0.45 * norm(ring))
    return 0.5 * norm(tonal) * spd ** 1.3 + 0.3 * norm(fan) + 0.08 * hum + grind
