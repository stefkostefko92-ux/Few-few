#!/usr/bin/env python3
"""Италиански думи без ударение → правилната форма (perché, più, già, funzionalità…).

Генераторите са писани без ударения на места и италианецът го вижда веднага като
небрежност (одит 25.09.2026: „piu" на 30 страници, „gia" на 24, „perche" на 19).
Пуска се от cs-revolution/ върху италианските страници (public/ без en/ и bg/) и върху
генераторите, така че регенерация не връща грешката:
    python3 scripts/it-accents.py
Идемпотентно. Думата се сменя само като цяла дума и никога вътре в URL/слъг
(съседен „/", „-" или буква я пазят), затова адресите остават непокътнати.
"""
import glob
import re

WORDS = {
    "perche": "perché", "Perche": "Perché", "poiche": "poiché", "affinche": "affinché", "benche": "benché",
    "piu": "più", "Piu": "Più", "gia": "già", "Gia": "Già", "puo": "può", "cosi": "così", "Cosi": "Così",
    "cioe": "cioè", "pero": "però", "Lunedi": "Lunedì", "Martedi": "Martedì", "Mercoledi": "Mercoledì",
    "Giovedi": "Giovedì", "Venerdi": "Venerdì", "citta": "città", "qualita": "qualità", "quantita": "quantità",
    "proprieta": "proprietà", "funzionalita": "funzionalità", "contabilita": "contabilità", "attivita": "attività",
    "velocita": "velocità", "disponibilita": "disponibilità", "possibilita": "possibilità", "novita": "novità",
    "visibilita": "visibilità", "affidabilita": "affidabilità", "scalabilita": "scalabilità", "identita": "identità",
    "responsabilita": "responsabilità", "modalita": "modalità", "capacita": "capacità", "pubblicita": "pubblicità",
    "priorita": "priorità", "complessita": "complessità", "necessita": "necessità", "flessibilita": "flessibilità",
    "stabilita": "stabilità", "semplicita": "semplicità", "sostenibilita": "sostenibilità", "opportunita": "opportunità",
    "accessibilita": "accessibilità", "compatibilita": "compatibilità", "usabilita": "usabilità", "tracciabilita": "tracciabilità",
    "manutenibilita": "manutenibilità", "leggibilita": "leggibilità", "realta": "realtà", "societa": "società",
    "universita": "università", "sara": "sarà", "potra": "potrà", "dovra": "dovrà", "avra": "avrà", "comunita": "comunità", "verita": "verità", "liberta": "libertà",
}
PHRASES = [
    ("La stima e vincolante", "La stima è vincolante"), ("No, e una ", "No, è una "), ("Cos'e ", "Cos'è "), ("cos'e ", "cos'è "),
    (">Si. ", ">Sì. "), ('"Si. ', '"Sì. '), ("E' ", "È "),
    ("La SEO e un ", "La SEO è un "), ("agenzia web e affidabile", "agenzia web è affidabile"), ("seria si. ", "seria sì. "),
    ("di solito e incluso", "di solito è incluso"), ("Spesso si. ", "Spesso sì. "), ("perchè", "perché"), ("Perchè", "Perché"),
    ("richiede da <strong>1 a 2 settimane</strong>", "richiede da <strong>2 a 3 settimane</strong>"),
    ("<td>E-commerce</td><td>3-6 settimane</td>", "<td>E-commerce</td><td>3-5 settimane</td>"),
    ("<td>E-commerce</td><td>3-6 weeks</td>", "<td>E-commerce</td><td>3-5 weeks</td>"),
]
# the verb „è"/„dà" in the most common comparative phrases (the conjunction „e" stays)
VERB = [(re.compile(r" e più (semplice|economico|economica|veloce|costoso|costosa|adatto|adatta|sicuro|sicura|flessibile|facile|complesso|complessa|leggero|scalabile)\b"), r" è più \1"),
        (re.compile(r"\bda più controllo\b"), "dà più controllo")]
# «unita» is left out on purpose: it is also a correct word (participle of «unire»).
# Capitalised forms (sentence start / titles) are derived automatically.
WORDS.update({k[0].upper() + k[1:]: v[0].upper() + v[1:] for k, v in list(WORDS.items()) if k.islower() and k != "sara"})
RX = re.compile(r"(?<![\w/\-])(" + "|".join(sorted(WORDS, key=len, reverse=True)) + r")(?![\w/\-])")


def fix(text):
    out = RX.sub(lambda m: WORDS[m.group(1)], text)
    for a, b in PHRASES:
        out = out.replace(a, b)
    for rx, b in VERB:
        out = rx.sub(b, out)
    return out


def main():
    files = [p for p in glob.glob("public/**/*.html", recursive=True) if not p.startswith(("public/en/", "public/bg/"))]
    files += sorted(glob.glob("scripts/generate-*.py"))
    files += ["public/feed.xml", "public/llms.txt", "public/llms-full.txt"]
    files = [p for p in files if __import__("os").path.exists(p)]
    n = 0
    for p in files:
        s = open(p, encoding="utf-8").read()
        o = fix(s)
        if o != s:
            open(p, "w", encoding="utf-8").write(o)
            n += 1
    print(f"it-accents: поправени {n} файла")


if __name__ == "__main__":
    main()
