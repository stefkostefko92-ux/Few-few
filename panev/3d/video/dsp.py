"""Sound of the mounting video, the shared part (numpy only, 48 kHz stereo; every noise is seeded, so a run repeats
itself): oscillators, zero-phase FFT filters, a time-varying low-pass, modal hits, reverb impulse responses, placing a
sound on the timeline, a limiter and the WAV writer. score.py writes the music, sfx.py the tools, audio.py mixes."""
import wave
import numpy as np

SR = 48000


def ns(sec):
    return int(round(sec * SR))


def times(n):
    return np.arange(n) / SR


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def ease(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# magnitude curves of the FFT filters (f in Hz, arrays welcome)
def lowpass(f, fc, order=2):
    return 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def highpass(f, fc, order=2):
    r = (np.maximum(f, 1e-3) / fc) ** (2 * order)
    return np.sqrt(r / (1 + r))


def band(f, lo, hi, order=2):
    return highpass(f, lo, order) * lowpass(f, hi, order)


def peak(f, fc, gain_db, width=1.0):
    """A bell in log frequency: gain_db at fc, width in octaves (to about half the gain)."""
    w = np.log2(np.maximum(f, 1.0) / fc) / width
    return 10 ** (gain_db / 20 * np.exp(-2.77 * w * w))


def shape(x, curve):
    """Zero-phase filter on the last axis: x's spectrum times curve(freqs)."""
    n = x.shape[-1]
    nf = 1 << int(np.ceil(np.log2(n + 8192)))
    X = np.fft.rfft(x, nf)
    X *= curve(np.fft.rfftfreq(nf, 1 / SR))
    return np.fft.irfft(X, nf)[..., :n]


def sweep(x, cutoff, order=2, nfft=2048, hop=512):
    """Time-varying low-pass (STFT, periodic Hann at 75 % overlap): cutoff(seconds array) gives Hz per frame."""
    n = x.shape[-1]
    pad = np.zeros(x.shape[:-1] + (n + 2 * nfft,))
    pad[..., nfft:nfft + n] = x
    win = np.hanning(nfft + 1)[:-1]
    out = np.zeros_like(pad)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    starts = np.arange(0, pad.shape[-1] - nfft + 1, hop)
    for c in range(0, len(starts), 256):
        st = starts[c:c + 256]
        F = np.fft.rfft(pad[..., st[:, None] + np.arange(nfft)] * win, axis=-1)
        F *= lowpass(f[None, :], cutoff((st + nfft / 2 - nfft) / SR)[:, None], order)
        y = np.fft.irfft(F, nfft, axis=-1)
        for i, s in enumerate(st):
            out[..., s:s + nfft] += y[..., i, :]
    return out[..., nfft:nfft + n] / 2.0


def saw(freq, seed=0):
    """Band-limited saw (PolyBLEP); freq is Hz per sample."""
    dt = freq / SR
    ph = (np.cumsum(dt) + np.random.default_rng(seed).uniform()) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    u = ph[m] / dt[m]
    y[m] -= u + u - u * u - 1
    m = ph > 1 - dt
    u = (ph[m] - 1) / dt[m]
    y[m] -= u * u + u + u + 1
    return y


def modal(freqs, t60s, amps, dur, seed, jitter=0.02):
    """Struck object: damped sines (T60 each), random phases, a 0.5 ms onset."""
    rng = np.random.default_rng(seed)
    t = times(ns(dur))
    y = np.zeros_like(t)
    for f, d, a in zip(freqs, t60s, amps):
        f *= 1 + rng.uniform(-jitter, jitter)
        if f < SR * 0.45:
            y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-6.91 * t / d)
    return y * np.minimum(1.0, t / 0.0005)


def burst(dur, lo, hi, t60, seed):
    """Short filtered noise with an exponential decay: the scrape or crack of a contact."""
    n = ns(dur)
    return shape(noise(n, seed), lambda f: band(f, lo, hi)) * np.exp(-6.91 * times(n) / t60)


def pan2(sig, pan):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)


def place(buf, t, sig, gain=1.0, pan=0.0):
    """Adds a mono (panned, -1 left … 1 right) or stereo sound to the stereo buffer at second t."""
    if sig.ndim == 1:
        sig = pan2(sig, pan)
    i = ns(t)
    j0, j1 = max(i, 0), min(i + sig.shape[-1], buf.shape[-1])
    if j1 > j0:
        buf[:, j0:j1] += gain * sig[:, j0 - i:j1 - i]


def reverb_ir(rt60, pre, seed, hf=0.45, xover=1500.0, early=()):
    """Stereo impulse response: decorrelated noise, the highs dying hf times faster, early taps (s, gain), unit energy."""
    n = ns(rt60 * 1.1)
    t = times(n)
    out = []
    for ch in range(2):
        w = noise(n, seed + ch)
        lo = shape(w, lambda f: lowpass(f, xover, 1)) * np.exp(-6.91 * t / rt60)
        hi = shape(w, lambda f: highpass(f, xover, 1)) * np.exp(-6.91 * t / (rt60 * hf))
        ir = np.concatenate([np.zeros(ns(pre)), (lo + hi) * np.minimum(1.0, t / 0.012)])
        for k, (dt, g) in enumerate(early):
            ir[ns(dt * (1 + 0.07 * ch * (-1) ** k))] += g * np.sqrt(np.sum(ir ** 2) / n) * 40
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(out)


def convolve(x, ir):
    """Stereo x through a stereo impulse response (FFT), cut to x's length."""
    n = x.shape[-1]
    nf = 1 << int(np.ceil(np.log2(n + ir.shape[-1])))
    return np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(ir, nf), nf)[..., :n]


def follow(x, attack, release, hop=0.005):
    """Level of a stereo signal (RMS per hop, then attack/release smoothing), per sample."""
    m = np.mean(x * x, axis=0)
    h = ns(hop)
    blocks = np.sqrt(np.add.reduceat(m, np.arange(0, len(m), h)) / h)
    ka, kr = np.exp(-hop / attack), np.exp(-hop / release)
    env, e = np.empty_like(blocks), 0.0
    for i, v in enumerate(blocks):
        e = (ka if v > e else kr) * e + (1 - (ka if v > e else kr)) * v
        env[i] = e
    return np.interp(np.arange(len(m)), np.arange(len(blocks)) * h, env)


def true_peak(x, over=4, block=1 << 16, edge=512):
    """Per-sample peak of the stereo signal oversampled 4× (as a true-peak meter reads it), block by block."""
    n = x.shape[-1]
    out = np.zeros(n)
    for s in range(0, n, block):
        a, b = max(0, s - edge), min(n, s + block + edge)
        y = np.fft.irfft(np.fft.rfft(x[:, a:b], axis=-1), (b - a) * over, axis=-1) * over
        pk = np.abs(y).max(axis=0).reshape(b - a, over).max(axis=1)
        out[s:s + block] = pk[s - a:s - a + min(block, n - s)]
    return out


def limit(x, ceiling, look=0.003, release=0.08):
    """True-peak limiter: gain never lets the 4× oversampled peak pass the ceiling; it reacts look seconds early and
    recovers over release."""
    p = true_peak(x)
    need = np.minimum(1.0, ceiling / np.maximum(p, 1e-9))
    w = ns(look)
    ahead = np.min(np.lib.stride_tricks.sliding_window_view(np.concatenate([need, np.ones(w)]), w + 1), axis=1)
    c = np.cumsum(np.concatenate([np.ones(w + 1), ahead]))
    g = (c[w + 1:] - c[:-(w + 1)]) / (w + 1)  # a linear ramp down to the lowest gain ahead, reached at the peak
    h = ns(0.001)
    gb = np.minimum.reduceat(g, np.arange(0, len(g), h))
    kr = np.exp(-0.001 / release)
    for i in range(1, len(gb)):
        gb[i] = min(gb[i], kr * gb[i - 1] + (1 - kr))
    g = np.minimum(g, np.interp(np.arange(len(g)), np.arange(len(gb)) * h, gb))
    return x * g


def write_wav(path, x):
    """Stereo float (-1 … 1) → 24-bit PCM WAV."""
    q = np.round(np.clip(x, -1, 1 - 2 ** -23).T * (2 ** 23 - 1)).astype("<i4")
    raw = q.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)
