#!/usr/bin/env python3
"""Build a self-contained HTML "clip preview" from a country's script.md.

Usage:
    python tools/build_preview.py clips/mexico
    # → writes clips/mexico/preview.html  (open in any browser)

The preview auto-plays through the episode like a video: one full-screen slide
per landmark (countdown 10 → 1) plus intro/outro, with a progress bar and timing.
It narrates each slide aloud using the browser's built-in speech synthesis
(pick a female English voice) — a stand-in for the final ElevenLabs "Charlotte"
voiceover. Stdlib only.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path


def parse_script(md: str) -> dict:
    # First title option, e.g. "- Top 10 Most AMAZING Landmarks in Mexico ..."
    title = "Top 10 Landmarks"
    mt = re.search(r"\*\*Title[^\n]*\*\*[^\n]*\n-\s*([^\n]+)", md)
    if mt:
        title = mt.group(1).strip()

    thumb = ""
    mth = re.search(r"\*\*Thumbnail text:\*\*\s*`([^`]+)`", md)
    if mth:
        thumb = mth.group(1).strip()

    # Narration section.
    mn = re.search(r"^##\s+Narration.*?$(.*)", md, flags=re.MULTILINE | re.DOTALL)
    body = mn.group(1) if mn else md

    slides = []
    # Split into "### Heading ... text" blocks.
    for block in re.split(r"^###\s+", body, flags=re.MULTILINE)[1:]:
        lines = block.splitlines()
        heading = lines[0].strip()
        rest = "\n".join(lines[1:])

        broll = ""
        mb = re.search(r"\*B-roll:?\s*(.+?)\*", rest)
        if mb:
            broll = mb.group(1).strip().rstrip(".")

        # Spoken text: drop stage directions / italic note lines, strip markdown.
        spoken = []
        for ln in rest.splitlines():
            s = ln.strip()
            if not s or s.startswith("*") or s == "---":
                continue
            spoken.append(s)
        text = re.sub(r"[*_`]", "", " ".join(spoken)).strip()

        rank = None
        name = heading
        mr = re.match(r"#(\d+)\s*—\s*(.+)", heading)
        if mr:
            rank = int(mr.group(1))
            name = mr.group(2).strip()
        slides.append({"rank": rank, "name": name, "text": text, "broll": broll})

    return {"title": title, "thumb": thumb, "slides": slides}


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ — Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#000; }
  #stage { position: fixed; inset: 0; overflow: hidden; color: #fff; }
  .slide { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center;
           padding: 8vw; opacity:0; transition: opacity .6s ease; }
  .slide.on { opacity:1; }
  .rank { position:absolute; top:2vh; right:4vw; font-size:34vh; font-weight:900;
          line-height:1; color:rgba(255,255,255,.10); }
  .kicker { font-size: clamp(14px,2.2vw,26px); letter-spacing:.3em; text-transform:uppercase;
            opacity:.85; margin-bottom:1.5vh; }
  .name { font-size: clamp(30px,6.5vw,84px); font-weight:800; line-height:1.05; margin-bottom:3vh;
          text-shadow:0 4px 30px rgba(0,0,0,.4); max-width:18ch; }
  .text { font-size: clamp(16px,2.6vw,30px); line-height:1.5; max-width:30ch; opacity:.96; }
  .broll { position:absolute; left:8vw; bottom:9vh; font-size: clamp(12px,1.6vw,18px);
           opacity:.8; max-width:40ch; }
  .broll b { letter-spacing:.15em; text-transform:uppercase; opacity:.9; }
  #bar { position:fixed; left:0; bottom:0; height:6px; background:#fff; width:0; transition:width .25s linear; }
  #hud { position:fixed; left:0; bottom:0; width:100%; height:6px; background:rgba(255,255,255,.2); }
  #ctrl { position:fixed; top:2vh; left:4vw; display:flex; gap:10px; align-items:center; z-index:5;
          font-size:14px; }
  button, select { font:inherit; font-size:14px; padding:8px 12px; border:0; border-radius:8px;
            background:rgba(255,255,255,.16); color:#fff; cursor:pointer; backdrop-filter:blur(6px); }
  button:hover { background:rgba(255,255,255,.28); }
  #brand { position:fixed; top:2vh; right:4vw; font-weight:700; letter-spacing:.1em; opacity:.9; z-index:5;
           font-size: clamp(12px,1.5vw,18px); }
  #intro-hint { position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
                background:rgba(0,0,0,.6); z-index:10; cursor:pointer; text-align:center; }
  #intro-hint div { font-size: clamp(18px,3vw,30px); }
</style>
</head>
<body>
<div id="stage"></div>
<div id="hud"></div><div id="bar"></div>
<div id="ctrl">
  <button id="pp">⏸ Pause</button>
  <button id="prev">◀ Prev</button>
  <button id="next">Next ▶</button>
  <button id="mute">🔊 Voice on</button>
  <select id="voice" title="Narration voice"></select>
</div>
<div id="brand">__THUMB__</div>
<div id="intro-hint"><div>▶ Click anywhere to play the preview<br><small>(with narration voice)</small></div></div>
<script>
const DATA = __DATA__;
const PALETTES = [
  ['#0f2027','#2c5364'],['#3a1c71','#d76d77'],['#134e5e','#71b280'],['#1a2a6c','#b21f1f'],
  ['#00467f','#a5cc82'],['#232526','#414345'],['#0b486b','#f56217'],['#42275a','#734b6d'],
  ['#1f4037','#99f2c8'],['#16222a','#3a6073'],['#4b6cb7','#182848'],['#000428','#004e92']
];
const stage = document.getElementById('stage');
const slides = DATA.slides.map((s,i)=>{
  const el = document.createElement('div'); el.className='slide';
  const [a,b] = PALETTES[i % PALETTES.length];
  el.style.background = `linear-gradient(135deg, ${a}, ${b})`;
  const kicker = s.rank!=null ? `Number ${s.rank}` : (i===0?'Intro':'');
  el.innerHTML = `
    ${s.rank!=null?`<div class="rank">${s.rank}</div>`:''}
    ${kicker?`<div class="kicker">${kicker}</div>`:''}
    <div class="name">${s.name}</div>
    <div class="text">${s.text}</div>
    ${s.broll?`<div class="broll"><b>🎬 B-roll:</b> ${s.broll}</div>`:''}`;
  stage.appendChild(el); return el;
});
const bar = document.getElementById('bar');
let idx=0, playing=false, voiceOn=true, timer=null, voices=[], chosen=null;
const wpm=160;

function dur(t){ const w=(t.match(/\\S+/g)||[]).length; return Math.max(4200, w/wpm*60000)+700; }
function speak(t){ if(!voiceOn||!window.speechSynthesis) return false;
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.rate=1.0; u.pitch=1.0;
  if(chosen) u.voice=chosen; u.onend=()=>{ if(playing) next(); }; speechSynthesis.speak(u); return true; }
function show(i){ slides.forEach((el,j)=>el.classList.toggle('on', j===i)); idx=i;
  bar.style.transition='none'; bar.style.width='0';
  const d=dur(DATA.slides[i].text); requestAnimationFrame(()=>{ bar.style.transition=`width ${d}ms linear`; bar.style.width='100%'; });
  clearTimeout(timer);
  const spoke = speak(DATA.slides[i].text);
  if(!spoke && playing) timer=setTimeout(next, d);
}
function next(){ if(idx<slides.length-1) show(idx+1); else stop(); }
function prev(){ show(Math.max(0,idx-1)); }
function play(){ playing=true; document.getElementById('pp').textContent='⏸ Pause'; show(idx); }
function stop(){ playing=false; clearTimeout(timer); if(window.speechSynthesis) speechSynthesis.cancel();
  document.getElementById('pp').textContent='▶ Play'; }
document.getElementById('pp').onclick=()=> playing?stop():play();
document.getElementById('next').onclick=()=>{ stop(); next(); };
document.getElementById('prev').onclick=()=>{ stop(); prev(); };
document.getElementById('mute').onclick=function(){ voiceOn=!voiceOn;
  this.textContent= voiceOn?'🔊 Voice on':'🔇 Voice off'; if(!voiceOn&&window.speechSynthesis) speechSynthesis.cancel(); };

function loadVoices(){ voices=(window.speechSynthesis?speechSynthesis.getVoices():[]).filter(v=>v.lang.startsWith('en'));
  const sel=document.getElementById('voice'); sel.innerHTML='';
  const fem=/female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|zira|jenny|aria|sonia|libby|charlotte|amelia|google uk english female/i;
  voices.sort((a,b)=>(fem.test(b.name)?1:0)-(fem.test(a.name)?1:0));
  voices.forEach((v,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=v.name+' ('+v.lang+')'; sel.appendChild(o); });
  chosen = voices.find(v=>fem.test(v.name)) || voices[0] || null;
  if(chosen) sel.value = voices.indexOf(chosen);
  sel.onchange=()=> chosen=voices[sel.value];
}
if(window.speechSynthesis){ loadVoices(); speechSynthesis.onvoiceschanged=loadVoices; }
document.getElementById('intro-hint').onclick=function(){ this.style.display='none'; play(); };
show(0);
</script>
</body>
</html>
"""


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/build_preview.py clips/<country>")
    folder = Path(sys.argv[1])
    script = folder / "script.md"
    if not script.exists():
        sys.exit(f"Not found: {script}")

    data = parse_script(script.read_text(encoding="utf-8"))
    out = folder / "preview.html"
    page = (HTML_TEMPLATE
            .replace("__TITLE__", html.escape(data["title"]))
            .replace("__THUMB__", html.escape(data["thumb"]))
            .replace("__DATA__", json.dumps(data)))
    out.write_text(page, encoding="utf-8")
    print(f"✓ preview → {out}  ({len(data['slides'])} slides)")


if __name__ == "__main__":
    main()
