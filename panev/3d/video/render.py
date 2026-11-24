"""python render.py light|heavy [--only stills,shots,assemble,audio,encode] [--shots asm,pos] [--bench T] — the video.

light  review clip: Cycles on the CPU, 1280x720 at 12 samples, 24 fps, frames 1920x1080, H.264 CRF 23.
heavy  the master: Cycles + OptiX on the NVIDIA card, 3840x2160 at 96 samples, 60 fps, frames 3840x2160,
       H.264 NVENC 60 Mbps for YouTube (tools/video/presets.mjs frames).
Sound: audio.py writes the music and the tools (one soundtrack for both presets, 48 kHz), presets.mjs loudnorm sets
it to −14 LUFS / −1.5 dBTP, encode puts it under the picture (AAC 384 kb/s). It needs no render: --only audio,encode.
Every step resumes: a shot continues after its last saved frame, assembly skips frames already written.
--bench T renders one full frame at second T with the preset's settings and prints the time (estimate first).
Needs: Blender (BLENDER=<path> or on PATH), Node, FFmpeg, Python with numpy + pillow, assets/ (fetch_assets.py),
mesh/ (node export_mesh.mjs, from panev/3d after npm ci)."""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
PRESETS_MJS = os.path.join(REPO, "tools", "video", "presets.mjs")
SOUND = os.path.join(HERE, "out", "audio")
PRESETS = {
    "light": {"VIDEO_FPS": "24", "VIDEO_RES": "1280x720", "VIDEO_OUT": "1920x1080", "VIDEO_DEVICE": "CPU",
              "spp": 12, "still_spp": 32, "still_res": "1920x1080"},
    "heavy": {"VIDEO_FPS": "60", "VIDEO_RES": "3840x2160", "VIDEO_OUT": "3840x2160", "VIDEO_DEVICE": "OPTIX",
              "spp": 96, "still_spp": 256, "still_res": "3840x2160"},
}
sys.path.insert(0, HERE)
from timeline import DURATION  # noqa: E402 (pure python, no bpy)
STILL_T = {"intro": 2.0, "hero": DURATION - 2.0}


def blender():
    exe = os.environ.get("BLENDER") or shutil.which("blender")
    if not exe:
        found = sorted(glob.glob(r"C:\Program Files\Blender Foundation\Blender*\blender.exe"))
        exe = found[-1] if found else None
    if not exe:
        sys.exit("Blender not found: install it (winget install BlenderFoundation.Blender) or set BLENDER=<path>")
    return exe


def run(cmd, env, log):
    print(">", " ".join(cmd), flush=True)
    with open(log, "a", encoding="utf-8") as fh:
        p = subprocess.run(cmd, env=env, stdout=fh, stderr=subprocess.STDOUT)
    if p.returncode:
        sys.exit(f"failed ({p.returncode}): {' '.join(cmd)} — see {log}")


def bl(script, args, env, log):
    run([blender(), "-b", "--factory-startup", "-noaudio", "-P", os.path.join(HERE, script), "--", *args], env, log)


def check_inputs():
    if not os.path.exists(os.path.join(HERE, "mesh", "pair.json")):
        sys.exit("mesh/ missing: cd panev/3d && npm ci && node video/export_mesh.mjs")
    if not os.path.exists(os.path.join(HERE, "assets", "LICENSES.txt")):
        sys.exit("assets/ missing: python fetch_assets.py")


def stills(cfg, env, root, log):
    fps = int(cfg["VIDEO_FPS"])
    for name, t in STILL_T.items():
        if os.path.exists(os.path.join(root, f"{name}.png")):
            continue
        tmp = os.path.join(root, "stills")
        bl("run.py", [tmp, str(cfg["still_spp"]), cfg["still_res"], str(t)], env, log)
        shutil.copyfile(os.path.join(tmp, f"f{round(t * fps):05d}.png"), os.path.join(root, f"{name}.png"))
        with open(os.path.join(root, f"{name}.json"), "w") as fh:
            json.dump({}, fh)


def shots(cfg, env, root, log, only):
    sys.path.insert(0, HERE)
    from timeline import TIMELINE
    for name, _a, _b in TIMELINE:
        if name in STILL_T or (only and name not in only):
            continue
        tic = time.time()
        bl("shot.py", [name, os.path.join(root, name), str(cfg["spp"])], env, log)
        print(f"shot {name}: {(time.time() - tic) / 60:.1f} min", flush=True)


def assemble(cfg, env, root, frames, log):
    os.makedirs(frames, exist_ok=True)
    total = round(DURATION * int(cfg["VIDEO_FPS"]))
    todo = [f for f in range(total) if not os.path.exists(os.path.join(frames, f"v{f:05d}.png"))]
    if not todo:
        return
    n = max(1, min(int(os.environ.get("VIDEO_JOBS", os.cpu_count() or 2)) - 1, 12))
    size = -(-len(todo) // n)
    procs = []
    for i in range(0, len(todo), size):  # contiguous ranges: each process walks its frames in order
        a, b = todo[i], todo[min(i + size, len(todo)) - 1]
        procs.append(subprocess.Popen([sys.executable, os.path.join(HERE, "assemble.py"), root, frames, str(a), str(b)],
                                      env=env, stdout=open(log, "a"), stderr=subprocess.STDOUT))
    if any(p.wait() for p in procs):
        sys.exit(f"assembly failed — see {log}")


def audio(log):
    """The soundtrack: audio.py, then the two-pass loudnorm. Returns the final WAV."""
    raw, final = os.path.join(SOUND, "mix.wav"), os.path.join(SOUND, "mix-14.wav")
    run([sys.executable, os.path.join(HERE, "audio.py"), raw], os.environ.copy(), log)
    run(["node", PRESETS_MJS, "loudnorm", "--in", raw, "--out", final, "--force", "--run"], os.environ.copy(), log)
    return final


def encode(preset, frames, out, sound):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pattern = os.path.join(frames, "v%05d.png")
    if not os.path.exists(sound):
        print(f"no soundtrack yet ({sound}): the video is silent — run with --only audio,encode", flush=True)
        sound = None
    if preset == "light":
        a = ["-i", sound, "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-shortest"] if sound else []
        run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "24", "-i", pattern, *a[:2], "-c:v", "libx264", "-preset",
             "medium", "-crf", "23", "-profile:v", "high", "-pix_fmt", "yuv420p", *a[2:], "-movflags", "+faststart", out],
            os.environ.copy(), out + ".log")
        return
    enc = os.environ.get("VIDEO_ENCODER", "h264_nvenc")
    run(["node", PRESETS_MJS, "frames", "--pattern", pattern, "--out", out, "--fps", "60", "--encoder", enc, "--force",
         "--run", *(["--audio", sound] if sound else [])], os.environ.copy(), out + ".log")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("preset", choices=PRESETS)
    ap.add_argument("--only", default="stills,shots,assemble,audio,encode")
    ap.add_argument("--shots", default="")
    ap.add_argument("--bench", type=float)
    a = ap.parse_args()
    cfg = PRESETS[a.preset]
    env = {**os.environ, **{k: v for k, v in cfg.items() if k.startswith("VIDEO_")}}
    root = os.path.join(HERE, "render", a.preset)
    frames = os.path.join(HERE, "frames", a.preset)
    out = os.path.join(HERE, "out", f"Panev_montaggio-in-undici-passi_{'4K60' if a.preset == 'heavy' else 'leggero'}.mp4")
    os.makedirs(root, exist_ok=True)
    log = os.path.join(root, "render.log")
    steps = a.only.split(",")
    if a.bench is not None or {"stills", "shots"} & set(steps):  # the sound and the encode need no scene
        check_inputs()
    if a.bench is not None:
        tic = time.time()
        bl("run.py", [os.path.join(root, "bench"), str(cfg["spp"]), cfg["VIDEO_RES"], str(a.bench)], env, log)
        print(f"bench: one full frame at {a.bench} s in {time.time() - tic:.0f} s (scene build included) — see {log}")
        return
    only = [s for s in a.shots.split(",") if s]
    if "stills" in steps:
        stills(cfg, env, root, log)
    if "shots" in steps:
        shots(cfg, env, root, log, only)
    if "assemble" in steps:
        assemble(cfg, env, root, frames, log)
    sound = os.path.join(SOUND, "mix-14.wav")
    if "audio" in steps:
        sound = audio(log)
    if "encode" in steps:
        encode(a.preset, frames, out, sound)
        print("done:", out)


if __name__ == "__main__":
    main()
