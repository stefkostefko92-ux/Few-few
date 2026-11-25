"""python audio.py <out.wav> [--stems <dir>] — the soundtrack of the mounting video: the music (score.py) under the
tools (sfx.py). The tools sound in the shaft (bare concrete, ~0.9 s); the music ducks by how much the tools are above it
(about −8 dB under the grinder, −6 under the drill, nothing under a click). The sum goes through a peak limiter and is set near −14 LUFS;
render.py then runs the two-pass loudnorm of tools/video/presets.mjs (−14 LUFS, −1.5 dBTP) on it. Needs numpy, FFmpeg."""
import os
import re
import subprocess
import sys
import numpy as np
from dsp import ns, follow, limit, convolve, reverb_ir, write_wav
from timeline import DURATION
import score
import sfx

MUSIC, TOOLS = 0.42, 1.0       # bus gains: the music is a bed, the tools are the story
DUCK_OVER, DUCK_SLOPE, DUCK_MAX = -4.0, 0.75, 9.0  # tools above music − 4 dB push it down, 0.75 dB per dB, ≤ 9 dB
TARGET, CEILING = -14.0, -2.5  # LUFS and dBFS: the loudnorm pass then stays linear (true peak under −1.5)


def loudness(x):
    """Integrated loudness (LUFS) by FFmpeg's EBU R128 meter."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", "48000", "-ac", "2", "-i", "-",
                        "-af", "ebur128", "-f", "null", "-"], input=x.T.astype("<f4").tobytes(), capture_output=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", p.stderr.decode("utf-8", "replace"))
    if p.returncode or not m:
        sys.exit("audio: FFmpeg could not measure the loudness")
    return float(m[-1])


def mix():
    n = ns(DURATION)
    music = score.render(n)
    dry, wet = sfx.render(n)
    shaft = reverb_ir(0.9, 0.006, 5151, hf=0.5, xover=1200,
                      early=((0.007, 0.5), (0.013, 0.35), (0.021, 0.25), (0.034, 0.15)))
    tools = dry + convolve(wet, shaft)
    db = lambda x: 20 * np.log10(follow(x, 0.03, 0.35) + 1e-9)
    over = db(TOOLS * dry) - db(MUSIC * music)
    duck = 10 ** (-np.clip(DUCK_SLOPE * (over - DUCK_OVER), 0, DUCK_MAX) / 20)
    return MUSIC * music * duck, TOOLS * tools


def master(x):
    for _ in range(2):  # gain to the target, limit, measure again (limiting takes a little loudness away)
        x = limit(x * 10 ** ((TARGET - loudness(x)) / 20), 10 ** (CEILING / 20))
    return x


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python audio.py <out.wav> [--stems <dir>]")
    music, tools = mix()
    out = master(music + tools)
    os.makedirs(os.path.dirname(os.path.abspath(sys.argv[1])), exist_ok=True)
    write_wav(sys.argv[1], out)
    if "--stems" in sys.argv:
        d = sys.argv[sys.argv.index("--stems") + 1]
        os.makedirs(d, exist_ok=True)
        g = np.max(np.abs(out)) / max(1e-9, np.max(np.abs(music + tools)))
        write_wav(os.path.join(d, "music.wav"), music * g)
        write_wav(os.path.join(d, "tools.wav"), tools * g)
    print(f"audio: {sys.argv[1]} — {loudness(out):.1f} LUFS, peak {20 * np.log10(np.max(np.abs(out))):.1f} dBFS")


if __name__ == "__main__":
    main()
