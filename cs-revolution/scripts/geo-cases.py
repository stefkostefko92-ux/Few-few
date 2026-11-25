#!/usr/bin/env python3
"""Реални проекти в индексираните градски страници (SEO 2026-10-08).

Градските страници бяха един шаблон със сменено име на града; Google ги брои за doorway.
Тук вкарваме в тези, които остават индексирани (виж seo-index-policy.py), секция с
ПРОВЕРИМИ факти за реален проект в този град/регион — единственото, което ги прави
уникални и полезни. Нищо измислено: адресите и описанията са от сайтовете на клиентите
и от нашите кейс стъдита.

  * Милано  — Panev Ascensori SAS (Vittuone / Cornaredo, MI): сайт + ERP;
  * Дупница — Evanita Sport (студио за Kangoo Jumps);
  * Кюстендил — регионът на седалището ни (Бобов дол): училищен сайт, граждански портал, ателие.

Идемпотентно (маркер id="cs-case"); при повторно пускане секцията се подменя.
Пуска се от cs-revolution/ след генераторите:  python3 scripts/geo-cases.py
"""
import json
import re

PANEV_IMG = ('<img class="work-shot" src="/work/panev-ascensori.webp" srcset="/work/panev-ascensori-480.webp 480w, '
             '/work/panev-ascensori.webp 960w" sizes="(max-width:900px) 100vw, 860px" width="960" height="600" '
             'loading="lazy" decoding="async" alt="{alt}">')
EVANITA_IMG = ('<img class="work-shot" src="/work/evanita-sport.webp" srcset="/work/evanita-sport-480.webp 480w, '
               '/work/evanita-sport.webp 960w" sizes="(max-width:900px) 100vw, 860px" width="960" height="600" '
               'loading="lazy" decoding="async" alt="{alt}">')

CASES = {
    ("milano", "it"): dict(
        desc="Siti web, e-commerce e software per aziende di Milano. Per Panev Ascensori (Vittuone, MI) abbiamo realizzato sito ed ERP. Da €658 + IVA, preventivo in 24 ore.",
        html="<h2>Un progetto reale nell'area di Milano: Panev Ascensori</h2>"
             + PANEV_IMG.format(alt="Il sito panevascensori.it realizzato da Carbon Stealth")
             + "<p>Panev Ascensori SAS ha sede legale a Vittuone e sede operativa a Cornaredo, nella città metropolitana di Milano, e produce staffe brevettate per porte di piano e guide del contrappeso. Per loro abbiamo realizzato due cose:</p>"
             + "<ul><li><strong>Il sito <a href=\"https://panevascensori.it\" target=\"_blank\" rel=\"noopener\">panevascensori.it</a></strong>: prodotti e listino, catalogo PDF, vista 3D dei pezzi, lista d'ordine con richiesta via email, in italiano, inglese e bulgaro.</li>"
             + "<li><strong>Un ERP su misura</strong>: commesse in produzione, magazzino, fatturazione e permessi su 7 livelli di ruolo, con dashboard per la direzione. <a href=\"/case-study/erp-ascensori/\">Leggi il caso studio</a>.</li></ul>"
             + "<p>È lo stesso modo in cui lavoriamo con ogni azienda milanese: un unico referente che parla italiano, un preventivo a prezzo fisso e il codice che resta vostro.</p>"),
    ("milano", "en"): dict(
        desc="Websites, e-commerce and software for Milan companies. For Panev Ascensori (Vittuone, MI) we built the website and the ERP. From €658 + VAT, quote in 24 hours.",
        html="<h2>A real project in the Milan area: Panev Ascensori</h2>"
             + PANEV_IMG.format(alt="The panevascensori.it website built by Carbon Stealth")
             + "<p>Panev Ascensori SAS is registered in Vittuone and operates in Cornaredo, in the metropolitan city of Milan; it makes patented brackets for landing doors and counterweight guides. We built two things for them:</p>"
             + "<ul><li><strong>The <a href=\"https://panevascensori.it\" target=\"_blank\" rel=\"noopener\">panevascensori.it</a> website</strong>: products and price list, PDF catalogue, 3D views of the parts, an order list sent by email, in Italian, English and Bulgarian.</li>"
             + "<li><strong>A custom ERP</strong>: jobs through production, warehouse, invoicing and 7-level role permissions, with dashboards for management. <a href=\"/en/case-studies/erp-ascensori/\">Read the case study</a>.</li></ul>"
             + "<p>It is how we work with every Milan company: one contact person who speaks Italian, a fixed-price quote, and code that stays yours.</p>"),
    ("milano", "bg"): dict(
        desc="Сайтове, онлайн магазини и софтуер за фирми в Милано. За Panev Ascensori (Витуоне, MI) направихме сайта и ERP системата. От €790 с ДДС, оферта до 24 часа.",
        html="<h2>Реален проект в района на Милано: Panev Ascensori</h2>"
             + PANEV_IMG.format(alt="Сайтът panevascensori.it, направен от Carbon Stealth")
             + "<p>Panev Ascensori SAS е регистрирана във Витуоне, а производството ѝ е в Корнаредо — в метрополния град Милано. Фирмата произвежда патентовани скоби за етажни врати и водачи на противотежестта. За тях направихме две неща:</p>"
             + "<ul><li><strong>Сайтът <a href=\"https://panevascensori.it\" target=\"_blank\" rel=\"noopener\">panevascensori.it</a></strong>: продукти и ценоразпис, PDF каталог, 3D изглед на детайлите, списък за поръчка по имейл, на италиански, английски и български.</li>"
             + "<li><strong>ERP по поръчка</strong>: поръчки в производството, склад, фактуриране и права на 7 нива, с табла за ръководството. <a href=\"/bg/keys-studii/erp-ascensori/\">Прочетете кейс стъдито</a>.</li></ul>"
             + "<p>Така работим с всяка миланска фирма: един човек за контакт, който говори италиански, оферта на фиксирана цена и код, който остава ваш.</p>"),
    ("dupnitsa", "bg"): dict(
        html="<h2>Реален проект в Дупница: Evanita Sport</h2>"
             + EVANITA_IMG.format(alt="Сайтът evanita-bg.com, направен от Carbon Stealth")
             + "<p>За Evanita Sport — дамско студио за Kangoo Jumps и силови тренировки в Дупница — направихме бърз сайт, оптимизиран за телефон: инструкторът, тренировките и контакт с едно докосване — по телефон или Viber. Вижте го на <a href=\"https://evanita-bg.com\" target=\"_blank\" rel=\"noopener\">evanita-bg.com</a>.</p>"),
    ("dupnitsa", "it"): dict(
        html="<h2>Un progetto reale a Dupnitsa: Evanita Sport</h2>"
             + EVANITA_IMG.format(alt="Il sito evanita-bg.com realizzato da Carbon Stealth")
             + "<p>Per Evanita Sport, studio femminile di Kangoo Jumps e allenamento di forza a Dupnitsa, abbiamo realizzato un sito veloce pensato per lo smartphone: l'istruttrice, gli allenamenti e il contatto con un tocco, per telefono o Viber. Lo trovi su <a href=\"https://evanita-bg.com\" target=\"_blank\" rel=\"noopener\">evanita-bg.com</a>.</p>"),
    ("dupnitsa", "en"): dict(
        html="<h2>A real project in Dupnitsa: Evanita Sport</h2>"
             + EVANITA_IMG.format(alt="The evanita-bg.com website built by Carbon Stealth")
             + "<p>For Evanita Sport, a women's Kangoo Jumps and strength studio in Dupnitsa, we built a fast, phone-first website: the instructor, the workouts and one-tap contact by phone or Viber. See it at <a href=\"https://evanita-bg.com\" target=\"_blank\" rel=\"noopener\">evanita-bg.com</a>.</p>"),
    ("kyustendil", "bg"): dict(
        html="<h2>Нашият регион: проекти в Бобов дол</h2>"
             + "<p>Седалището ни е в Бобов дол, Кюстендилска област. Тук сме направили:</p>"
             + "<ul><li><strong>Сайта на ОУ „Никола Вапцаров“</strong> с новини и адаптивен дизайн — <a href=\"/bg/keys-studii/ou-vaptsarov/\">кейс стъди</a>;</li>"
             + "<li><strong><a href=\"https://zabobovdol.carbonstealth.eu\" target=\"_blank\" rel=\"noopener\">За Бобов дол</a></strong> — граждански портал с телефони, услуги, събития и сигнали;</li>"
             + "<li><strong><a href=\"https://eternaltouch.it\" target=\"_blank\" rel=\"noopener\">Eternal Touch</a></strong> — витрина и каталог на три езика за местно ателие за гипсови отливки.</li></ul>"),
    ("kyustendil", "it"): dict(
        html="<h2>La nostra regione: progetti a Bobov Dol</h2>"
             + "<p>La nostra sede è a Bobov Dol, provincia di Kyustendil. Qui abbiamo realizzato:</p>"
             + "<ul><li><strong>Il sito della scuola OU Nikola Vaptsarov</strong>, con notizie e design responsive — <a href=\"/case-study/ou-vaptsarov/\">caso studio</a>;</li>"
             + "<li><strong><a href=\"https://zabobovdol.carbonstealth.eu\" target=\"_blank\" rel=\"noopener\">Za Bobov Dol</a></strong>, il portale civico con numeri utili, servizi, eventi e segnalazioni;</li>"
             + "<li><strong><a href=\"https://eternaltouch.it\" target=\"_blank\" rel=\"noopener\">Eternal Touch</a></strong>, vetrina e catalogo in tre lingue per un atelier locale di decorazioni in gesso.</li></ul>"),
    ("kyustendil", "en"): dict(
        html="<h2>Our home region: projects in Bobov Dol</h2>"
             + "<p>Our headquarters are in Bobov Dol, Kyustendil province. Here we built:</p>"
             + "<ul><li><strong>The OU Nikola Vaptsarov school website</strong>, with news and responsive design — <a href=\"/en/case-studies/ou-vaptsarov/\">case study</a>;</li>"
             + "<li><strong><a href=\"https://zabobovdol.carbonstealth.eu\" target=\"_blank\" rel=\"noopener\">Za Bobov Dol</a></strong>, the civic portal with useful numbers, services, events and reports;</li>"
             + "<li><strong><a href=\"https://eternaltouch.it\" target=\"_blank\" rel=\"noopener\">Eternal Touch</a></strong>, a three-language showcase and catalogue for a local plaster-decor atelier.</li></ul>"),
}
# Въпрос „имате ли клиенти тук?“ — първи във видимия FAQ и в FAQPage схемата (двете трябва да съвпадат)
FAQ = {
    ("milano", "it"): ("Avete già clienti a Milano?",
                       "Sì. Per Panev Ascensori SAS (Vittuone e Cornaredo, MI) abbiamo realizzato il sito panevascensori.it e un ERP su misura per produzione, magazzino e fatturazione."),
    ("milano", "en"): ("Do you already have clients in Milan?",
                       "Yes. For Panev Ascensori SAS (Vittuone and Cornaredo, MI) we built the panevascensori.it website and a custom ERP for production, warehouse and invoicing."),
    ("milano", "bg"): ("Имате ли вече клиенти в Милано?",
                       "Да. За Panev Ascensori SAS (Витуоне и Корнаредо, MI) направихме сайта panevascensori.it и ERP система по поръчка за производство, склад и фактуриране."),
}
PATHS = {"it": "public/geo/{}/index.html", "en": "public/en/geo/{}/index.html", "bg": "public/bg/geo/{}/index.html"}
BLOCK_RX = re.compile(r'<section id="cs-case">.*?</section>', re.S)
FAQ_RX = re.compile(r'<div class="faq-item" data-case="1">.*?</div></div>', re.S)


def add_faq(s, q, a):
    s = FAQ_RX.sub("", s)
    item = f'<div class="faq-item" data-case="1"><div class="faq-q">{q}</div><div class="faq-a">{a}</div></div>'
    s = s.replace('<div class="faq-item">', item + '<div class="faq-item">', 1)
    ld = json.dumps({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}},
                    ensure_ascii=False, separators=(",", ":"))
    s = s.replace(ld + ",", "")                      # стар запис от предишно пускане
    return s.replace('"mainEntity":[', '"mainEntity":[' + ld + ",", 1)


LASTMOD = "2026-10-08"   # дата на реалното съдържание; смени я, когато промениш CASES/FAQ


def bump_lastmod(sitemap, locs):
    s = open(sitemap, encoding="utf-8").read()
    o = s
    for loc in locs:
        o = re.sub(r"(<loc>" + re.escape(loc) + r"</loc><lastmod>)[^<]*(</lastmod>)", r"\g<1>" + LASTMOD + r"\g<2>", o)
    if o != s:
        open(sitemap, "w", encoding="utf-8").write(o)


def main():
    n = 0
    bump_lastmod("public/sitemap-geo.xml",
                 ["https://carbonstealth.eu/" + PATHS[lang].format(city)[len("public/"):-len("index.html")] for city, lang in CASES])
    for (city, lang), c in CASES.items():
        p = PATHS[lang].format(city)
        s = open(p, encoding="utf-8").read()
        o = BLOCK_RX.sub("", s)
        block = '<section id="cs-case">' + c["html"] + "</section>"
        # right after the hero, before the generic intro
        o = o.replace('</div></div><div class="w">', '</div></div><div class="w">' + block, 1)
        if c.get("desc"):
            o = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + c["desc"] + m.group(2), o, count=1)
            o = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + c["desc"] + m.group(2), o, count=1)
        if (city, lang) in FAQ:
            o = add_faq(o, *FAQ[(city, lang)])
        if o != s:
            open(p, "w", encoding="utf-8").write(o); n += 1
    print(f"geo-cases: реални проекти в {n} градски страници")


if __name__ == "__main__":
    main()
