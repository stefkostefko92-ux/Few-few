#!/usr/bin/env python3
"""produce.py — turn a clips/<country>/script.md into a YouTube-ready 1080p MP4.

Professional, automated countdown-video pipeline:

  segment  → parse script.md into ordered segments (intro, 10→1, mentions, outro)
  voice    → narrate each segment (ElevenLabs "Charlotte"; free fallbacks if no key)
  footage  → one video clip per segment (Pexels video API, or your own files)
  render   → ffmpeg: Ken-Burns/scaled footage + animated rank number + lower-third
             name + burned subtitles + music bed (ducked under the voice)
  publish  → out/<country>.mp4  +  .srt  +  .description.txt (REAL chapter times)

Run everything:
    python tools/produce.py clips/mexico --all
Or a single stage:
    python tools/produce.py clips/mexico segment
    python tools/produce.py clips/mexico check

Needs: ffmpeg/ffprobe on PATH. Optional: ELEVENLABS_API_KEY (voice),
PEXELS_API_KEY (footage). Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ----------------------------------------------------------------------------- config
RES = {"1080p": (1920, 1080), "4k": (3840, 2160)}
CHARLOTTE = "XB0fDUnXU5powFXDhCwa"          # ElevenLabs voice id (series voice)
TTS_MODEL = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.80,
                  "style": 0.40, "use_speaker_boost": True}
WPM = 155                                    # fallback timing when no audio
FONT_CANDIDATES = [
    os.environ.get("FONT", ""),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def find_font() -> str:
    for f in FONT_CANDIDATES:
        if f and Path(f).exists():
            return f
    return ""  # ffmpeg drawtext will use its default if empty (may warn)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def ffprobe_dur(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", str(path)]).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


# ----------------------------------------------------------------------------- 1. segment
def clean(text: str) -> str:
    return re.sub(r"[*_`]", "", text).strip()


def parse_segments(md: str, country: str) -> list[dict]:
    mn = re.search(r"^##\s+Narration.*?$(.*)", md, flags=re.MULTILINE | re.DOTALL)
    body = mn.group(1) if mn else md
    segs = []
    for i, block in enumerate(re.split(r"^###\s+", body, flags=re.MULTILINE)[1:]):
        lines = block.splitlines()
        heading = lines[0].strip()
        rest = "\n".join(lines[1:])

        broll = ""
        mb = re.search(r"\*B-roll:?\s*(.+?)\*", rest)
        if mb:
            broll = mb.group(1).strip()

        spoken = [ln.strip() for ln in rest.splitlines()
                  if ln.strip() and not ln.strip().startswith("*") and ln.strip() != "---"]
        text = clean(" ".join(spoken))

        rank, name = None, heading
        mr = re.match(r"#(\d+)\s*—\s*(.+)", heading)
        if mr:
            rank, name = int(mr.group(1)), mr.group(2).strip()
        kind = ("landmark" if rank is not None
                else "intro" if i == 0 else
                "mentions" if "mention" in heading.lower() else "outro")

        # Search query for stock footage: landmark name w/o parenthetical + country.
        base = re.sub(r"\(.*?\)", "", name).strip() if rank else f"{country} landmark aerial"
        query = f"{base} {country}".strip() if rank else base

        segs.append({"i": len(segs), "kind": kind, "rank": rank,
                     "name": name, "text": text, "broll": broll, "query": query})
    return segs


def cmd_segment(folder: Path, country: str) -> list[dict]:
    md = (folder / "script.md").read_text(encoding="utf-8")
    segs = parse_segments(md, country)
    build = folder / "build"
    build.mkdir(exist_ok=True)
    (build / "segments.json").write_text(json.dumps(segs, indent=2, ensure_ascii=False),
                                         encoding="utf-8")
    print(f"  segment: {len(segs)} segments → {build/'segments.json'}")
    return segs


# ----------------------------------------------------------------------------- 2. voice
def tts_elevenlabs(text: str, out: Path, key: str) -> None:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{CHARLOTTE}"
    data = json.dumps({"text": text, "model_id": TTS_MODEL,
                       "voice_settings": VOICE_SETTINGS}).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req) as r:
        out.write_bytes(r.read())


def tts_local(text: str, out: Path) -> bool:
    """Best-effort offline voice: macOS `say`, then espeak-ng/espeak."""
    if shutil.which("say"):  # macOS — nice quality, female voice
        aiff = out.with_suffix(".aiff")
        subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), text], check=True)
        run(["ffmpeg", "-y", "-i", str(aiff), str(out)])
        aiff.unlink(missing_ok=True)
        return True
    for eng in ("espeak-ng", "espeak"):
        if shutil.which(eng):
            wav = out.with_suffix(".wav")
            subprocess.run([eng, "-v", "en+f3", "-s", "150", "-w", str(wav), text], check=True)
            run(["ffmpeg", "-y", "-i", str(wav), str(out)])
            wav.unlink(missing_ok=True)
            return True
    return False


def cmd_voice(folder: Path, segs: list[dict]) -> None:
    adir = folder / "build" / "audio"
    adir.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("ELEVENLABS_API_KEY")
    engine = "elevenlabs (Charlotte)" if key else ("local" )
    used = engine
    for s in segs:
        out = adir / f"{s['i']:02d}.mp3"
        if out.exists():
            continue
        if key:
            tts_elevenlabs(s["text"], out, key)
        elif not tts_local(s["text"], out):
            used = "none (silent, timed by reading speed)"
            break
    print(f"  voice: {used}")


# ----------------------------------------------------------------------------- 3. footage
def pexels_video(query: str, out: Path, key: str, w: int, h: int) -> bool:
    url = ("https://api.pexels.com/videos/search?orientation=landscape&size=medium"
           f"&per_page=3&query={urllib.parse.quote(query)}")
    req = urllib.request.Request(url, headers={"Authorization": key})
    try:
        with urllib.request.urlopen(req) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"    pexels {e.code} for '{query}'", file=sys.stderr)
        return False
    for video in res.get("videos", []):
        files = sorted(video.get("video_files", []),
                       key=lambda f: abs((f.get("width") or 0) - w))
        for f in files:
            if f.get("link"):
                urllib.request.urlretrieve(f["link"], out)
                return True
    return False


def cmd_footage(folder: Path, segs: list[dict], w: int, h: int) -> None:
    fdir = folder / "build" / "footage"
    fdir.mkdir(parents=True, exist_ok=True)
    local = folder / "assets"           # user-provided clips: assets/00.mp4, 01.mp4 ...
    key = os.environ.get("PEXELS_API_KEY")
    have = 0
    for s in segs:
        out = fdir / f"{s['i']:02d}.mp4"
        if out.exists():
            have += 1
            continue
        src = local / f"{s['i']:02d}.mp4"
        if src.exists():
            shutil.copy(src, out); have += 1; continue
        if key and pexels_video(s["query"], out, key, w, h):
            have += 1
    print(f"  footage: {have}/{len(segs)} clips ready "
          f"({'Pexels' if key else 'local assets/ only'})")


# ----------------------------------------------------------------------------- 4. render
def esc(t: str) -> str:
    return t.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"’")


def wrap(t: str, n: int) -> str:
    words, line, out = t.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > n:
            out.append(line); line = w
        else:
            line = f"{line} {w}".strip()
    out.append(line)
    return "\n".join(out)


def render_segment(seg: dict, dur: float, src: Path, dst: Path, w: int, h: int, font: str):
    """One segment clip: filled footage + slow zoom + rank badge + name lower-third."""
    fontfile = f"fontfile='{font}':" if font else ""
    vf = [
        f"scale={w}:{h}:force_original_aspect_ratio=increase",
        f"crop={w}:{h}",
        # slow Ken-Burns style push-in
        f"zoompan=z='min(zoom+0.0006,1.10)':d={max(1,int(dur*30))}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps=30",
        "format=yuv420p",
    ]
    if seg["rank"] is not None:
        vf.append(f"drawtext={fontfile}text='{seg['rank']}':fontsize={int(h*0.46)}:"
                  f"fontcolor=white@0.16:x=w-text_w-40:y=20")
        label = esc(seg["name"])
        vf.append(f"drawbox=x=0:y=h-{int(h*0.16)}:w=iw:h={int(h*0.16)}:color=black@0.45:t=fill")
        vf.append(f"drawtext={fontfile}text='{label}':fontsize={int(h*0.055)}:fontcolor=white:"
                  f"x=60:y=h-{int(h*0.115)}")
        vf.append(f"drawtext={fontfile}text='TOP 10':fontsize={int(h*0.03)}:fontcolor=white@0.8:"
                  f"x=60:y=h-{int(h*0.15)}")
    src_args = ["-stream_loop", "-1", "-i", str(src)] if src else \
               ["-f", "lavfi", "-i", f"color=c=0x101418:s={w}x{h}:r=30"]
    run(["ffmpeg", "-y", *src_args, "-t", f"{dur:.3f}",
         "-vf", ",".join(vf), "-an", "-r", "30",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(dst)])


def build_srt(segs: list[dict], durs: list[float], path: Path):
    def ts(t):
        h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")
    cues, n, clock = [], 1, 0.0
    for s, d in zip(segs, durs):
        parts = re.split(r"(?<=[.!?])\s+", s["text"]) or [s["text"]]
        total = sum(len(p) for p in parts) or 1
        t0 = clock
        for p in parts:
            seg_d = d * (len(p) / total)
            cues.append(f"{n}\n{ts(t0)} --> {ts(t0+seg_d)}\n{wrap(p,42)}\n")
            n += 1; t0 += seg_d
        clock += d
    path.write_text("\n".join(cues), encoding="utf-8")


def chapters_text(segs: list[dict], durs: list[float]) -> str:
    lines, clock = [], 0.0
    for s, d in zip(segs, durs):
        m, sec = int(clock // 60), int(clock % 60)
        clean_name = re.sub(r"\(.*?\)", "", s["name"]).strip()
        if s["rank"]:
            label = f"#{s['rank']} {clean_name}"
        else:
            label = clean_name or s["kind"].title()
        lines.append(f"{m:02d}:{sec:02d} {label}")
        clock += d
    return "\n".join(lines)


def cmd_render(folder: Path, country: str, segs: list[dict], w: int, h: int, music: str):
    build = folder / "build"
    adir, fdir = build / "audio", build / "footage"
    segdir = build / "segments"; segdir.mkdir(exist_ok=True)
    font = find_font()

    durs, concat = [], []
    for s in segs:
        a = adir / f"{s['i']:02d}.mp3"
        dur = ffprobe_dur(a) if a.exists() else max(4.0, len(s["text"].split()) / WPM * 60)
        durs.append(dur)
        src = fdir / f"{s['i']:02d}.mp4"
        dst = segdir / f"{s['i']:02d}.mp4"
        render_segment(s, dur, src if src.exists() else None, dst, w, h, font)
        concat.append(dst)

    # concat video
    lst = build / "concat.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in concat), encoding="utf-8")
    silent = build / "video_silent.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c", "copy", str(silent)])

    # narration track (concat per-segment audio, or silence)
    out = folder.parent.parent / "out"; out.mkdir(exist_ok=True)
    srt = out / f"{folder.name}.srt"
    build_srt(segs, durs, srt)

    have_audio = all((adir / f"{s['i']:02d}.mp3").exists() for s in segs)
    final = out / f"{folder.name}.mp4"
    vf_subs = f"subtitles='{srt.as_posix()}':force_style='FontSize=18,Outline=2,Shadow=0,MarginV=70'"

    if have_audio:
        alist = build / "audio.txt"
        audio_lines = []
        for s in segs:
            ap_ = (adir / f"{s['i']:02d}.mp3").resolve()
            audio_lines.append(f"file '{ap_}'\n")
        alist.write_text("".join(audio_lines), encoding="utf-8")
        narr = build / "narration.m4a"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(alist),
             "-c:a", "aac", "-b:a", "192k", str(narr)])
        if music and Path(music).exists():
            fc = ("[1:a]aformat=channel_layouts=stereo,apad[v];"
                  "[2:a]aformat=channel_layouts=stereo,volume=0.18[m0];"
                  "[m0][v]sidechaincompress=threshold=0.03:ratio=10:attack=5:release=350[m];"
                  "[v][m]amix=inputs=2:duration=first:dropout_transition=2[a]")
            run(["ffmpeg", "-y", "-i", str(silent), "-i", str(narr),
                 "-stream_loop", "-1", "-i", music, "-filter_complex", fc,
                 "-map", "0:v", "-map", "[a]", "-vf", vf_subs,
                 "-shortest", "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                 "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
        else:
            run(["ffmpeg", "-y", "-i", str(silent), "-i", str(narr),
                 "-map", "0:v", "-map", "1:a", "-vf", vf_subs, "-shortest",
                 "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                 "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
    else:
        run(["ffmpeg", "-y", "-i", str(silent), "-vf", vf_subs,
             "-c:v", "libx264", "-crf", "19", "-movflags", "+faststart", str(final)])

    # YouTube description with REAL chapter timestamps
    md = (folder / "script.md").read_text(encoding="utf-8")
    title = (re.search(r"\*\*Title[^\n]*\*\*[^\n]*\n-\s*([^\n]+)", md) or [None, country])[1]
    desc = out / f"{folder.name}.description.txt"
    body = re.search(r"\*\*Description:\*\*\s*```(.*?)```", md, re.DOTALL)
    base = body.group(1).strip() if body else ""
    base = re.sub(r"👇 CHAPTERS.*?(?=\n\n|\Z)", "👇 CHAPTERS\n" + chapters_text(segs, durs),
                  base, flags=re.DOTALL)
    desc.write_text(f"{str(title).strip()}\n\n{base}\n", encoding="utf-8")

    total = sum(durs)
    print(f"  render: {final}  ({int(total//60)}:{int(total%60):02d}, audio={'yes' if have_audio else 'NO'})")
    print(f"          + {srt.name}  + {desc.name}")


# ----------------------------------------------------------------------------- check / cli
def cmd_check():
    print("Environment check:")
    for tool in ("ffmpeg", "ffprobe"):
        print(f"  {tool:9} {'OK' if shutil.which(tool) else 'MISSING — install ffmpeg'}")
    print(f"  font      {find_font() or 'none found (set FONT=/path/to/font.ttf)'}")
    print(f"  ELEVENLABS_API_KEY  {'set (Charlotte voice)' if os.environ.get('ELEVENLABS_API_KEY') else 'not set → local/silent fallback'}")
    print(f"  PEXELS_API_KEY      {'set (auto footage)' if os.environ.get('PEXELS_API_KEY') else 'not set → put clips in clips/<x>/assets/NN.mp4'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", help="clips/<country>")
    ap.add_argument("stage", nargs="?", default="all",
                    choices=["all", "segment", "voice", "footage", "render", "check"])
    ap.add_argument("--res", default="1080p", choices=list(RES))
    ap.add_argument("--music", default=os.environ.get("MUSIC", ""),
                    help="path to a background music file (looped, ducked)")
    args = ap.parse_args()

    if args.stage == "check" or (args.folder == "check"):
        cmd_check(); return
    if not args.folder:
        ap.error("give a folder, e.g. clips/mexico")

    folder = Path(args.folder)
    if not (folder / "script.md").exists():
        sys.exit(f"no script.md in {folder}")
    needs_ffmpeg = args.stage in ("all", "footage", "render")
    if needs_ffmpeg and not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found — install it first (see PRODUCTION.md). Try: produce.py check")

    country = folder.name.replace("-", " ").title()
    w, h = RES[args.res]
    print(f"▶ {folder.name}  ({args.res})")

    segs = cmd_segment(folder, country)
    if args.stage in ("all", "voice"):
        cmd_voice(folder, segs)
    if args.stage in ("all", "footage"):
        cmd_footage(folder, segs, w, h)
    if args.stage in ("all", "render"):
        cmd_render(folder, country, segs, w, h, args.music)
    print("Done.")


if __name__ == "__main__":
    main()
