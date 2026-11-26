"""python captions.py [out.srt] — the Italian subtitles (SRT) of the mounting video for YouTube: word for word the copy
on screen (the step cards of texts.py, the intro and outro cards of overlay.py), timed on the cards (timeline.py).
On YouTube the copy becomes searchable and a viewer can auto-translate it. Lines up to 42 characters, two per cue;
a card longer than one cue is split, each part on screen for a time in proportion to its length."""
import os
import sys
import film  # the film's own texts and timeline come first
import timeline
from overlay import INTRO_CARD, OUTRO_CARD
from texts import STEP_TEXT
from timeline import STEPS, DURATION

WIDTH = 42
TITLE = 2.0  # s: "Passo k di 11 / title" alone before the step's line
INTRO = (0.3, 4.0, f"{INTRO_CARD[1]} {INTRO_CARD[2]}", f"{INTRO_CARD[3]} · {INTRO_CARD[4]}")
# the outro card (overlay.outro) comes 0.4 s after the last step; its words start 0.6 s before that step ends (the sill
# is flush again), so the note for installers stays readable before the end. The card's address is in the description.
OUTRO_START = STEPS[-1][1] - 0.6
OUTRO = (f"{OUTRO_CARD[0].capitalize()}: {OUTRO_CARD[1][0].lower()}{OUTRO_CARD[1][1:]}.", OUTRO_CARD[2])


def lines(text):
    """One line if it fits, else two about equally long (each up to WIDTH), else greedy lines."""
    if len(text) <= WIDTH:
        return [text]
    words = text.split(" ")
    two = [(" ".join(words[:i]), " ".join(words[i:])) for i in range(1, len(words))]
    two = [p for p in two if max(map(len, p)) <= WIDTH]
    if two:
        return list(min(two, key=lambda p: abs(len(p[0]) - len(p[1]))))
    out, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > WIDTH:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return out + [cur]


def chunks(text):
    """The text in as few cues of up to two lines as it takes, the cues about equally long."""
    words = text.split(" ")
    n = max(1, -(-len(text) // (2 * WIDTH)))
    while True:
        out, cur, target = [], [], len(text) / n
        for w in words:
            if cur and len(" ".join(cur + [w])) > target + 6 and len(out) < n - 1:
                out.append(" ".join(cur))
                cur = []
            cur.append(w)
        out.append(" ".join(cur))
        if all(len(lines(c)) <= 2 for c in out):
            return ["\n".join(lines(c)) for c in out]
        n += 1


def spread(a, b, texts):
    """Cues of up to two lines over [a, b], each one's time in proportion to its length."""
    parts = [c for text in texts for c in chunks(text)]
    total = sum(len(p) for p in parts)
    out, t = [], a
    for p in parts:
        d = (b - a) * len(p) / total
        out.append((t, t + d, p))
        t += d
    return out


def cues():
    out = [(INTRO[0], 1.6, INTRO[2])] + spread(1.6, INTRO[1], [INTRO[3]])
    for k, ((a, b), (title, body)) in enumerate(zip(STEPS, STEP_TEXT), 1):
        out.append((a, a + TITLE, f"Passo {k} di {len(STEPS)}\n{title}"))
        out += spread(a + TITLE, min(b, OUTRO_START) - 0.1, [body])
    return out + spread(OUTRO_START, DURATION, OUTRO)


def timeline_slug():
    return getattr(timeline, "SLUG", "Panev_montaggio-in-undici-passi")


def stamp(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(film.DIR, "out", f"{timeline_slug()}.it.srt")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        for i, (a, b, text) in enumerate(cues(), 1):
            fh.write(f"{i}\n{stamp(a)} --> {stamp(b)}\n{text}\n\n")
    print("captions:", path)


if __name__ == "__main__":
    main()
