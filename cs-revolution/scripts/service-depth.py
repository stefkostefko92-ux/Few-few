#!/usr/bin/env python3
"""Задълбочава основната услуга „изработка на сайтове“ (IT/EN/BG) — SEO 2026-10-08.

Search Console (експорт „обходена, но не индексирана“, 2026-10-08) показва, че Google
обхожда /servizi/sviluppo-siti-web/ и не я индексира: генеричен текст, без нито един
реален пример, със сроковете и цените, разминати между блоковете. Тук:
  * секция „Сайтове, които сме направили“ — петте реални сайта от портфолиото
    (снимка, какво направихме, линк към живия сайт и към кейс стъдито);
  * секция „Какво включва всеки пакет“ — генерира се от src/pricing.json (един източник
    на истината за цени, срокове и съдържание на пакетите);
  * поправки на факти: FID → INP (Google смени метриката през 03.2024), Review
    (самоописани отзиви не дават rich results) вън, цени и срокове във FAQ = ценоразписа;
  * FAQPage схемата се прави наново от видимия FAQ (беше 3 различни въпроса със стари
    цени „от 800 евро“ — Google иска схемата да съвпада с текста на страницата).
Идемпотентно (маркери <!--cs-work--> … <!--/cs-work-->). Пуска се от cs-revolution/
след generate-pricing.py:  python3 scripts/service-depth.py
"""
import html
import json
import re

PAGES = {"it": "public/servizi/sviluppo-siti-web/index.html",
         "en": "public/en/services/web-development/index.html",
         "bg": "public/bg/uslugi/web-razrabotka/index.html"}
CASE = {"it": "/case-study/{}/", "en": "/en/case-studies/{}/", "bg": "/bg/keys-studii/{}/"}
PORTFOLIO = {"it": "/portfolio/", "en": "/en/portfolio/", "bg": "/bg/portfolio/"}
PRICING = {"it": "/prezzi/", "en": "/en/pricing/", "bg": "/bg/ceni/"}

T = {
    "it": dict(h_work="Siti web che abbiamo realizzato",
               work_intro="Cinque siti reali, online oggi, ognuno nato da un'esigenza diversa: catalogo tecnico, servizio pubblico, scuola, studio sportivo, artigianato.",
               visit="Visita il sito", case="Caso studio", all="Tutti gli 11 progetti nel portfolio",
               h_tiers="Cosa include ogni pacchetto", tiers_intro="Prezzi e tempi sono gli stessi del listino: nessun costo nascosto, il preventivo conferma il perimetro.",
               days="{a}–{b} giorni lavorativi", full="Listino completo, add-on, IVA e condizioni"),
    "en": dict(h_work="Websites we have built",
               work_intro="Five real websites, live today, each built for a different need: technical catalogue, public service, school, fitness studio, craft workshop.",
               visit="Visit the site", case="Case study", all="All 11 projects in the portfolio",
               h_tiers="What each package includes", tiers_intro="Prices and timelines are the same as in the price list: no hidden costs, the quote confirms the scope.",
               days="{a}–{b} working days", full="Full price list, add-ons, VAT and terms"),
    "bg": dict(h_work="Сайтове, които сме направили",
               work_intro="Пет реални сайта, които работят днес, всеки за различна нужда: технически каталог, обществена услуга, училище, спортно студио, занаятчийско ателие.",
               visit="Към сайта", case="Кейс стъди", all="Всички 11 проекта в портфолиото",
               h_tiers="Какво включва всеки пакет", tiers_intro="Цените и сроковете са същите като в ценоразписа: без скрити разходи, офертата потвърждава обхвата.",
               days="{a}–{b} работни дни", full="Пълен ценоразпис, добавки, ДДС и условия"),
}

# Само факти от портфолиото, кейс стъдитата и самите сайтове.
WORK = [
    dict(slug="panev-ascensori", url="https://panevascensori.it", host="panevascensori.it", case="erp-ascensori",
         name={"it": "Panev Ascensori", "en": "Panev Ascensori", "bg": "Panev Ascensori"},
         stack="Express · SQLite · Stripe",
         d={"it": "Produttore di staffe brevettate per ascensori a Vittuone e Cornaredo (MI). Prodotti e listino, catalogo PDF, vista 3D dei pezzi e lista d'ordine via email, in italiano, inglese e bulgaro. Per lo stesso cliente abbiamo realizzato anche l'ERP.",
            "en": "Maker of patented elevator brackets in Vittuone and Cornaredo (Milan). Products and price list, PDF catalogue, 3D views of the parts and an order list sent by email, in Italian, English and Bulgarian. We also built this client's ERP.",
            "bg": "Производител на патентовани скоби за асансьори във Витуоне и Корнаредо (Милано). Продукти и ценоразпис, PDF каталог, 3D изглед на детайлите и списък за поръчка по имейл, на италиански, английски и български. За същия клиент направихме и ERP системата."}),
    dict(slug="zabobovdol", url="https://zabobovdol.carbonstealth.eu", host="zabobovdol.carbonstealth.eu", case=None,
         name={"it": "Za Bobov Dol", "en": "Za Bobov Dol", "bg": "За Бобов дол"},
         stack="Next.js · Prisma · PostgreSQL",
         d={"it": "Portale civico di Bobov Dol: numeri e servizi utili, guide passo passo ai servizi online, eventi, annunci e catalogo delle attività locali, con opzioni di accessibilità per tutte le età.",
            "en": "Civic portal for Bobov Dol: useful numbers and services, step-by-step guides to online public services, events, listings and a local business directory, with accessibility options for all ages.",
            "bg": "Граждански портал за Бобов дол: важни телефони и услуги, обяснения стъпка по стъпка за е-услугите, събития, обяви и каталог на местния бизнес, с настройки за достъпност за всички възрасти."}),
    dict(slug="ou-vaptsarov", url="https://ouvaptsarov.com", host="ouvaptsarov.com", case="ou-vaptsarov",
         name={"it": "OU Nikola Vaptsarov", "en": "OU Nikola Vaptsarov", "bg": "ОУ „Никола Вапцаров“"},
         stack="React · Vite · PHP",
         d={"it": "Sito istituzionale della scuola elementare di Bobov Dol, con sistema di notizie e design responsive.",
            "en": "Official website of the elementary school in Bobov Dol, with a news system and responsive design.",
            "bg": "Официалният сайт на основното училище в Бобов дол, със система за новини и респонсив дизайн."}),
    dict(slug="evanita-sport", url="https://evanita-bg.com", host="evanita-bg.com", case=None,
         name={"it": "Evanita Sport", "en": "Evanita Sport", "bg": "Evanita Sport"},
         stack="HTML · CSS · JS · Nginx",
         d={"it": "Studio femminile di Kangoo Jumps e allenamento di forza a Dupnitsa: sito statico veloce, pensato per lo smartphone: l'istruttrice, gli allenamenti e il contatto con un tocco, per telefono o Viber.",
            "en": "Women's Kangoo Jumps and strength studio in Dupnitsa: a fast static site built for the phone: the instructor, the workouts and one-tap contact by phone or Viber.",
            "bg": "Дамско студио за Kangoo Jumps и силови тренировки в Дупница: бърз статичен сайт, направен за телефона: инструкторът, тренировките и контакт с едно докосване — по телефон или Viber."}),
    dict(slug="eternal-touch", url="https://eternaltouch.it", host="eternaltouch.it", case=None,
         name={"it": "Eternal Touch", "en": "Eternal Touch", "bg": "Eternal Touch"},
         stack="Express · EJS · Prisma · PostgreSQL",
         d={"it": "Atelier di decorazioni in gesso fatte a mano, bomboniere e creazioni su misura: vetrina e catalogo in tre lingue.",
            "en": "Atelier for handmade plaster decorations, favours and bespoke pieces: showcase and catalogue in three languages.",
            "bg": "Ателие за ръчно изработени гипсови декорации, бонбониери и изделия по поръчка: витрина и каталог на три езика."}),
]

# Поправки на факти — (стар текст, нов текст); прилагат се на видимия текст и на схемата.
FIX = {
    "it": [("LCP sotto 2.5s, FID sotto 100ms, CLS sotto 0.1", "LCP sotto 2,5 s, INP sotto 200 ms, CLS sotto 0,1"),
           ("FAQ, HowTo, Review, LocalBusiness", "FAQ, HowTo, LocalBusiness"),
           ("I nostri siti web partono da €1.575 + IVA per siti vetrina fino a €5,000+ per e-commerce complessi e portali aziendali.",
            "Una landing page parte da €658 + IVA, un sito aziendale da €1.575 + IVA, un e-commerce da €1.825 + IVA e il pacchetto Premium (3 lingue + pannello admin) da €3.575 + IVA; portali e web app si quotano a parte."),
           ("Un sito vetrina richiede 2-3 settimane, un sito aziendale 2-4 settimane, un e-commerce 3-5 settimane, e progetti enterprise 2-6 mesi.",
            "Una landing page richiede 5-7 giorni lavorativi, un sito aziendale 10-15, un e-commerce 15-25 e il pacchetto Premium 20-30; web app e portali su misura 2-3 mesi."),
           ("Premium ed e-commerce: 3-5 settimane.", "E-commerce: 15-25 giorni lavorativi. Premium: 20-30 giorni lavorativi.")],
    "en": [("LCP under 2.5s, FID under 100ms, CLS under 0.1", "LCP under 2.5 s, INP under 200 ms, CLS under 0.1"),
           ("FAQ, HowTo, Review, LocalBusiness", "FAQ, HowTo, LocalBusiness"),
           ("Our websites start at €1,575 + VAT for showcase sites up to €5,000+ for complex e-commerce and corporate portals.",
            "A landing page starts at €658 + VAT, a business website at €1,575 + VAT, an online shop at €1,825 + VAT and the Premium package (3 languages + admin panel) at €3,575 + VAT; portals and web apps are quoted separately."),
           ("A showcase site takes 2-3 weeks, a corporate site 2-4 weeks, an e-commerce 3-5 weeks, and enterprise projects 2-6 months.",
            "A landing page takes 5-7 working days, a business website 10-15, an online shop 15-25 and the Premium package 20-30; custom web apps and portals 2-3 months."),
           ("Premium and online shop: 3-5 weeks.", "Online shop: 15-25 working days. Premium: 20-30 working days.")],
    "bg": [("LCP под 2.5s, FID под 100ms, CLS под 0.1", "LCP под 2,5 s, INP под 200 ms, CLS под 0,1"),
           ("FAQ, HowTo, Review, LocalBusiness", "FAQ, HowTo, LocalBusiness"),
           ("Нашите сайтове започват от €1890 с ДДС за прости визитки до €5,000+ за сложни e-commerce и корпоративни портали.",
            "Лендинг страница струва от €790 с ДДС, фирмен сайт от €1890 с ДДС, онлайн магазин от €2190 с ДДС, а пакетът Премиум (3 езика + админ панел) от €4290 с ДДС; портали и уеб приложения се оценяват отделно."),
           ("Визитен сайт отнема 2-3 седмици, корпоративен сайт 2-4 седмици, e-commerce 3-5 седмици, а enterprise проекти 2-6 месеца.",
            "Лендинг страница — 5-7 работни дни, фирмен сайт — 10-15, онлайн магазин — 15-25, пакетът Премиум — 20-30; уеб приложения и портали по поръчка — 2-3 месеца.")],
}

CSS = ("<style>#cs-work .cs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:18px;margin:22px 0 10px}"
       "#cs-work .cs-grid2{grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}"
       "#cs-work .cs-card{border:1px solid rgba(0,229,255,.14);background:rgba(0,229,255,.02);padding:0 0 16px;display:flex;flex-direction:column}"
       "#cs-work .cs-card img{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top;background:#050607;border-bottom:1px solid rgba(0,229,255,.12)}"
       "#cs-work .cs-card h3{font-size:17px;margin:14px 16px 4px;color:#E8EEF1}"
       "#cs-work .cs-card .cs-stack{font-size:10px;letter-spacing:.14em;color:#8a949b;margin:0 16px 8px;text-transform:uppercase}"
       "#cs-work .cs-card p{margin:0 16px 10px;font-size:13.5px;line-height:1.7}"
       "#cs-work .cs-card .cs-links{margin:auto 16px 0;font-size:12px;display:flex;flex-wrap:wrap;gap:6px 16px}"
       "#cs-work .cs-card .cs-links a{display:inline-block;min-height:24px;line-height:24px}"
       "#cs-work .cs-tier{border:1px solid rgba(0,229,255,.14);padding:16px 18px;background:rgba(0,229,255,.015)}"
       "#cs-work .cs-tier h3{font-size:18px;margin:0 0 2px;color:#E8EEF1}"
       "#cs-work .cs-tier .cs-price{color:#00e5ff;font-size:15px;margin:0 0 2px}"
       "#cs-work .cs-tier .cs-days{font-size:11px;color:#9AA5AC;margin:0 0 10px;letter-spacing:.06em}"
       "#cs-work .cs-tier ul{margin:0;padding-left:18px}#cs-work .cs-tier li{font-size:13px;line-height:1.7}"
       "</style>")
BLOCK_RX = re.compile(r"<!--cs-work-->.*?<!--/cs-work-->\n?", re.S)


def price(lang, n):
    if lang == "bg":
        return f"€{n} с ДДС"
    s = f"{n:,}"
    return ("€" + s.replace(",", ".") + " + IVA") if lang == "it" else ("€" + s + " + VAT")


def block(lang, tiers):
    t = T[lang]
    cards = []
    for w in WORK:
        links = f'<a href="{w["url"]}" target="_blank" rel="noopener">{t["visit"]}: {w["host"]}</a>'
        if w["case"]:
            links += f'<a href="{CASE[lang].format(w["case"])}">{t["case"]}</a>'
        name = html.escape(w["name"][lang])
        cards.append(
            f'<div class="cs-card"><img src="/work/{w["slug"]}-480.webp" width="480" height="300" loading="lazy" decoding="async" '
            f'alt="{html.escape(w["host"])} — {name}"><h3>{name}</h3><div class="cs-stack">{w["stack"]}</div>'
            f'<p>{html.escape(w["d"][lang])}</p><div class="cs-links">{links}</div></div>')
    tier_html = []
    for tr in sorted(tiers, key=lambda x: x["price"][lang]):
        if tr["id"] not in ("start", "business", "premium", "ecommerce"):
            continue
        feats = "".join(f"<li>{html.escape(f)}</li>" for f in tr["features"][lang])
        tier_html.append(
            f'<div class="cs-tier"><h3>{html.escape(tr["name"][lang])} · {html.escape(tr["tag"][lang])}</h3>'
            f'<p class="cs-price">{price(lang, tr["price"][lang])}</p>'
            f'<p class="cs-days">{t["days"].format(a=tr["days"][0], b=tr["days"][1])}</p><ul>{feats}</ul></div>')
    return ("<!--cs-work-->" + CSS + '<div class="w" id="cs-work">'
            f'<h2>{t["h_work"]}</h2><p>{t["work_intro"]}</p><div class="cs-grid">{"".join(cards)}</div>'
            f'<p><a href="{PORTFOLIO[lang]}">{t["all"]} &rarr;</a></p>'
            f'<h2>{t["h_tiers"]}</h2><p>{t["tiers_intro"]}</p><div class="cs-grid cs-grid2">{"".join(tier_html)}</div>'
            f'<p><a href="{PRICING[lang]}">{t["full"]} &rarr;</a></p></div><!--/cs-work-->')


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def faq_from_visible(s):
    """FAQPage.mainEntity = видимите <details> въпроси/отговори, нищо друго."""
    qa = [(text(q), text(a)) for q, a in re.findall(r"<details[^>]*>\s*<summary[^>]*>(.*?)</summary>\s*<p[^>]*>(.*?)</p>", s, re.S)]
    ents = [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]

    def fix(m):
        d = json.loads(m.group(1))
        nodes = d.get("@graph", [d]) if isinstance(d, dict) else d
        hit = False
        for n in nodes:
            if isinstance(n, dict) and n.get("@type") == "FAQPage":
                n["mainEntity"] = ents; hit = True
        if not hit:
            return m.group(0)
        return ('<script type="application/ld+json">'
                + json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>")
    return re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix, s, flags=re.S), len(ents)


LASTMOD = "2026-10-08"   # дата на реалното съдържание; смени я, когато промениш WORK/FIX


def bump_lastmod(sitemap, locs):
    s = open(sitemap, encoding="utf-8").read()
    o = s
    for loc in locs:
        o = re.sub(r"(<loc>" + re.escape(loc) + r"</loc><lastmod>)[^<]*(</lastmod>)", r"\g<1>" + LASTMOD + r"\g<2>", o)
    if o != s:
        open(sitemap, "w", encoding="utf-8").write(o)


def main():
    bump_lastmod("public/sitemap-pages.xml",
                 ["https://carbonstealth.eu/" + p[len("public/"):-len("index.html")] for p in PAGES.values()])
    tiers = json.load(open("src/pricing.json", encoding="utf-8"))["tiers"]
    for lang, p in PAGES.items():
        s = open(p, encoding="utf-8").read()
        o = BLOCK_RX.sub("", s)
        for old, new in FIX[lang]:
            o = o.replace(old, new)
        o = o.replace('<div class="w seo-body">', block(lang, tiers) + '\n<div class="w seo-body">', 1)
        o, nq = faq_from_visible(o)
        if o != s:
            open(p, "w", encoding="utf-8").write(o)
        left = [old for old, _ in FIX[lang] if old in o]
        print(f"service-depth {lang}: {len(WORK)} проекта, FAQ схема = {nq} видими въпроса"
              + (f"; НЕПОПРАВЕНО: {left}" if left else ""))


if __name__ == "__main__":
    main()
