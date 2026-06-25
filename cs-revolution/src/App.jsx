import React, { useState, useEffect, useRef } from "react";
// THREE.js is lazy loaded inside Scene3D via dynamic import()
// This removes 465KB from the initial bundle and improves LCP/FCP significantly

// ═══════════════════════════════════════════════════════════════
// MULTILINGUAL SYSTEM — IT / EN / BG with auto-detection
// ═══════════════════════════════════════════════════════════════
var LANGS = {
  // ── NAV ──
  nav_manifesto: { it: "CHI SIAMO", en: "ABOUT", bg: "\u0417\u0410 \u041D\u0410\u0421" },
  nav_services: { it: "SERVIZI", en: "SERVICES", bg: "\u0423\u0421\u041B\u0423\u0413\u0418" },
  nav_work: { it: "PORTFOLIO", en: "WORK", bg: "\u041F\u041E\u0420\u0422\u0424\u041E\u041B\u0418\u041E" },
  nav_lab: { it: "REVERSE LAB", en: "REVERSE LAB", bg: "REVERSE LAB" },
  nav_test: { it: "ANALISI SITO", en: "SITE ANALYSIS", bg: "\u0410\u041D\u0410\u041B\u0418\u0417 \u041D\u0410 \u0421\u0410\u0419\u0422" },
  nav_contact: { it: "CONTATTI", en: "CONTACT", bg: "\u041A\u041E\u041D\u0422\u0410\u041A\u0422\u0418" },
  // ── HERO ──
  hero_eyebrow: {
    it: "AGENZIA DIGITALE \u2014 BOBOV DOL, BULGARIA",
    en: "DIGITAL AGENCY \u2014 BOBOV DOL, BULGARIA",
    bg: "\u0414\u0418\u0413\u0418\u0422\u0410\u041B\u041D\u0410 \u0410\u0413\u0415\u041D\u0426\u0418\u042F \u2014 \u0411\u041E\u0411\u041E\u0412 \u0414\u041E\u041B, \u0411\u042A\u041B\u0413\u0410\u0420\u0418\u042F"
  },
  hero_title: {
    it: "SOLUZIONI DIGITALI OLTRE OGNI LIMITE",
    en: "DIGITAL SOLUTIONS BEYOND ALL LIMITS",
    bg: "\u0414\u0418\u0413\u0418\u0422\u0410\u041B\u041D\u0418 \u0420\u0415\u0428\u0415\u041D\u0418\u042F \u041E\u0422\u0412\u042A\u0414 \u0412\u0421\u042F\u041A\u0410 \u0413\u0420\u0410\u041D\u0418\u0426\u0410"
  },
  hero_sub: {
    it: "AVVICINA IL CURSORE \u2014 LE LETTERE TI SFUGGONO",
    en: "HOVER HERE \u2014 LETTERS FLEE FROM YOUR CURSOR",
    bg: "\u041C\u0418\u041D\u0418 \u041E\u0422\u0422\u0423\u041A \u2014 \u0411\u0423\u041A\u0412\u0418\u0422\u0415 \u0411\u042F\u0413\u0410\u0422"
  },
  hero_desc: {
    it: "Muovi il cursore sul testo \u2014 reagisce al tuo tocco. Ogni pixel di questo sito \u00e8 vivo: 3D, fisica, arte generativa in tempo reale.",
    en: "Move your cursor over the text \u2014 it reacts to your touch. Every pixel of this site is alive: 3D, physics, generative art in real time.",
    bg: "\u041F\u0440\u0435\u043C\u0435\u0441\u0442\u0438 \u043A\u0443\u0440\u0441\u043E\u0440\u0430 \u043D\u0430\u0434 \u0442\u0435\u043A\u0441\u0442\u0430 \u2014 \u0442\u043E\u0439 \u0440\u0435\u0430\u0433\u0438\u0440\u0430 \u043D\u0430 \u0434\u043E\u043A\u043E\u0441\u0432\u0430\u043D\u0435\u0442\u043E \u0442\u0438. \u0412\u0441\u0435\u043A\u0438 \u043F\u0438\u043A\u0441\u0435\u043B \u043D\u0430 \u0442\u043E\u0437\u0438 \u0441\u0430\u0439\u0442 \u0435 \u0436\u0438\u0432: 3D, \u0444\u0438\u0437\u0438\u043A\u0430, \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u0438\u0432\u043D\u043E \u0438\u0437\u043A\u0443\u0441\u0442\u0432\u043E \u0432 \u0440\u0435\u0430\u043B\u043D\u043E \u0432\u0440\u0435\u043C\u0435."
  },
  // ── ABOUT ──
  about_tag: { it: "// CHI SIAMO", en: "// ABOUT US", bg: "// \u0417\u0410 \u041D\u0410\u0421" },
  about_scroll: {
    it: "CREIAMO SOLUZIONI DIGITALI CHE FUNZIONANO. DAI GIOCHI BROWSER AI SISTEMI PER ASCENSORI. DALL'E-COMMERCE IN FIBRA DI CARBONIO ALLA SICUREZZA FIVEM. SENZA LIMITI.",
    en: "WE BUILD DIGITAL SOLUTIONS THAT WORK. FROM BROWSER GAMES TO ELEVATOR SYSTEMS. FROM CARBON FIBER E-COMMERCE TO FIVEM SECURITY. NO LIMITS.",
    bg: "\u0421\u042A\u0417\u0414\u0410\u0412\u0410\u041C\u0415 \u0414\u0418\u0413\u0418\u0422\u0410\u041B\u041D\u0418 \u0420\u0415\u0428\u0415\u041D\u0418\u042F \u041A\u041E\u0418\u0422\u041E \u0420\u0410\u0411\u041E\u0422\u042F\u0422. \u041E\u0422 \u0411\u0420\u0410\u0423\u0417\u042A\u0420 \u0418\u0413\u0420\u0418 \u0414\u041E \u0421\u0418\u0421\u0422\u0415\u041C\u0418 \u0417\u0410 \u0410\u0421\u0410\u041D\u0421\u042C\u041E\u0420\u0418. \u041E\u0422 E-COMMERCE \u0417\u0410 \u041A\u0410\u0420\u0411\u041E\u041D \u0414\u041E FIVEM \u0417\u0410\u0429\u0418\u0422\u0410. \u0411\u0415\u0417 \u041B\u0418\u041C\u0418\u0422\u0418."
  },
  about_body: {
    it: "Carbon Stealth \u00e8 un'agenzia digitale a 360 gradi. Web app, giochi multiplayer, dashboard IoT, programmazione PLC \u2014 da Bobov Dol per il mondo intero.",
    en: "Carbon Stealth is a full-spectrum digital agency. Web apps, multiplayer games, IoT dashboards, PLC programming \u2014 from Bobov Dol to the entire world.",
    bg: "Carbon Stealth \u0435 \u0434\u0438\u0433\u0438\u0442\u0430\u043B\u043D\u0430 \u0430\u0433\u0435\u043D\u0446\u0438\u044F \u0441 \u043F\u044A\u043B\u0435\u043D \u0441\u043F\u0435\u043A\u0442\u044A\u0440 \u043E\u0442 \u0443\u0441\u043B\u0443\u0433\u0438. \u0423\u0435\u0431 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u043C\u0443\u043B\u0442\u0438\u043F\u043B\u0435\u0439\u044A\u0440 \u0438\u0433\u0440\u0438, IoT, PLC \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0438\u0440\u0430\u043D\u0435 \u2014 \u043E\u0442 \u0411\u043E\u0431\u043E\u0432 \u0434\u043E\u043B \u0437\u0430 \u0446\u0435\u043B\u0438\u044F \u0441\u0432\u044F\u0442."
  },
  stat_1: { it: "PROGETTI COMPLETATI", en: "PROJECTS COMPLETED", bg: "\u0417\u0410\u0412\u042A\u0420\u0428\u0415\u041D\u0418 \u041F\u0420\u041E\u0415\u041A\u0422\u0418" },
  stat_2: { it: "CLIENTI SODDISFATTI", en: "SATISFIED CLIENTS", bg: "\u0414\u041E\u0412\u041E\u041B\u041D\u0418 \u041A\u041B\u0418\u0415\u041D\u0422\u0418" },
  stat_3: { it: "LINGUE", en: "LANGUAGES", bg: "\u0415\u0417\u0418\u041A\u0410" },
  stat_4: { it: "TEMPLATES USATI", en: "TEMPLATES USED", bg: "\u0428\u0410\u0411\u041B\u041E\u041D\u0418" },
  // ── SERVICES ──
  srv_tag: { it: "// SERVIZI", en: "// SERVICES", bg: "// \u0423\u0421\u041B\u0423\u0413\u0418" },
  srv_title: { it: "COSA FACCIAMO", en: "WHAT WE DO", bg: "\u041A\u0410\u041A\u0412\u041E \u041F\u0420\u0410\u0412\u0418\u041C" },
  // ── WORK ──
  work_tag: { it: "// PORTFOLIO", en: "// PORTFOLIO", bg: "// \u041F\u041E\u0420\u0422\u0424\u041E\u041B\u0418\u041E" },
  work_title: { it: "LAVORI RECENTI", en: "RECENT WORK", bg: "\u041F\u041E\u0421\u041B\u0415\u0414\u041D\u0418 \u041F\u0420\u041E\u0415\u041A\u0422\u0418" },
  // ── PRODUCTS ──
  prod_tag: { it: "// PRODOTTI LIVE", en: "// LIVE PRODUCTS", bg: "// \u041D\u0410\u0428\u0418 \u041F\u0420\u041E\u0414\u0423\u041A\u0422\u0418" },
  prod_title: { it: "LE NOSTRE PIATTAFORME", en: "OUR PLATFORMS", bg: "\u041D\u0410\u0428\u0418\u0422\u0415 \u041F\u041B\u0410\u0422\u0424\u041E\u0420\u041C\u0418" },
  // ── REVERSE LAB ──
  lab_tag: { it: "// REVERSE LAB", en: "// REVERSE LAB", bg: "// REVERSE LAB" },
  lab_title: { it: "DAL FISICO AL DIGITALE E RITORNO", en: "FROM PHYSICAL TO DIGITAL AND BACK", bg: "\u041e\u0422 \u0424\u0418\u0417\u0418\u0427\u041d\u041e\u0422\u041e \u041a\u042a\u041c \u0414\u0418\u0413\u0418\u0422\u0410\u041b\u041d\u041e\u0422\u041e \u0418 \u041e\u0411\u0420\u0410\u0422\u041d\u041e" },
  lab_desc: {
    it: "Reverse engineering di componenti e dispositivi: scansione, ricostruzione CAD, analisi di protocolli e firmware. Poi stampiamo in 3D prototipi, ricambi introvabili e piccole serie \u2014 dal pezzo rotto al file STL al pezzo nuovo.",
    en: "Reverse engineering of parts and devices: scanning, CAD reconstruction, protocol and firmware analysis. Then we 3D print prototypes, unobtainable spare parts and small batches \u2014 from broken part to STL file to new part.",
    bg: "Reverse engineering \u043d\u0430 \u0447\u0430\u0441\u0442\u0438 \u0438 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430: \u0441\u043a\u0430\u043d\u0438\u0440\u0430\u043d\u0435, CAD \u0440\u0435\u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f, \u0430\u043d\u0430\u043b\u0438\u0437 \u043d\u0430 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u0438 \u0438 \u0444\u044a\u0440\u043c\u0443\u0435\u0440. \u0421\u043b\u0435\u0434 \u0442\u043e\u0432\u0430 \u043f\u0440\u0438\u043d\u0442\u0438\u0440\u0430\u043c\u0435 \u043d\u0430 3D \u043f\u0440\u0438\u043d\u0442\u0435\u0440 \u043f\u0440\u043e\u0442\u043e\u0442\u0438\u043f\u0438, \u043d\u0435\u043d\u0430\u043c\u0438\u0440\u0430\u0435\u043c\u0438 \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u0438 \u0447\u0430\u0441\u0442\u0438 \u0438 \u043c\u0430\u043b\u043a\u0438 \u0441\u0435\u0440\u0438\u0438 \u2014 \u043e\u0442 \u0441\u0447\u0443\u043f\u0435\u043d\u0430\u0442\u0430 \u0447\u0430\u0441\u0442 \u043f\u0440\u0435\u0437 STL \u0444\u0430\u0439\u043b\u0430 \u0434\u043e \u043d\u043e\u0432\u0430\u0442\u0430."
  },
  lab_b1: { it: "Scansione e ricostruzione CAD di parti meccaniche", en: "Scanning and CAD reconstruction of mechanical parts", bg: "\u0421\u043a\u0430\u043d\u0438\u0440\u0430\u043d\u0435 \u0438 CAD \u0440\u0435\u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f \u043d\u0430 \u043c\u0435\u0445\u0430\u043d\u0438\u0447\u043d\u0438 \u0447\u0430\u0441\u0442\u0438" },
  lab_b2: { it: "Stampa 3D: prototipi, ricambi, piccole serie (FDM)", en: "3D printing: prototypes, spare parts, small batches (FDM)", bg: "3D \u043f\u0435\u0447\u0430\u0442: \u043f\u0440\u043e\u0442\u043e\u0442\u0438\u043f\u0438, \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u0438 \u0447\u0430\u0441\u0442\u0438, \u043c\u0430\u043b\u043a\u0438 \u0441\u0435\u0440\u0438\u0438 (FDM)" },
  lab_b3: { it: "Analisi di protocolli, firmware e dispositivi embedded", en: "Protocol, firmware and embedded device analysis", bg: "\u0410\u043d\u0430\u043b\u0438\u0437 \u043d\u0430 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u0438, \u0444\u044a\u0440\u043c\u0443\u0435\u0440 \u0438 embedded \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430" },
  lab_cta: { it: "PORTACI IL PEZZO \u2192", en: "BRING US THE PART \u2192", bg: "\u0414\u041e\u041d\u0415\u0421\u0418 \u041d\u0418 \u0427\u0410\u0421\u0422\u0422\u0410 \u2192" },
  // ── MONUMENT ──
  mon_tag: { it: "// IL MONUMENTO", en: "// THE MONUMENT", bg: "// \u041c\u041e\u041d\u0423\u041c\u0415\u041d\u0422\u042a\u0422" },
  mon_title: { it: "COSTRUITO DA OGNI VISITATORE", en: "BUILT BY EVERY VISITOR", bg: "\u0418\u0417\u0413\u0420\u0410\u0414\u0415\u041d \u041e\u0422 \u0412\u0421\u0415\u041a\u0418 \u041f\u041e\u0421\u0415\u0422\u0418\u0422\u0415\u041b" },
  mon_desc: {
    it: "Un cristallo che cresce per sempre. Ogni visita forgia dal proprio comportamento \u2014 movimento del cursore, ritmo di scroll, tempo \u2014 un'impronta anonima che diventa un frammento permanente della struttura. Nessun dato personale: solo entropia. Questo monumento non potr\u00e0 mai diminuire. Anche tu ora ne fai parte.",
    en: "A crystal that grows forever. Every visit forges an anonymous imprint from its own behavior \u2014 cursor movement, scroll rhythm, time \u2014 and that imprint becomes a permanent shard of the structure. No personal data: pure entropy. This monument can never shrink. You are now part of it.",
    bg: "\u041a\u0440\u0438\u0441\u0442\u0430\u043b, \u043a\u043e\u0439\u0442\u043e \u0440\u0430\u0441\u0442\u0435 \u0437\u0430\u0432\u0438\u043d\u0430\u0433\u0438. \u0412\u0441\u044f\u043a\u043e \u043f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u0435 \u0438\u0437\u043a\u043e\u0432\u0430\u0432\u0430 \u043e\u0442 \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043e\u0442\u043e \u0441\u0438 \u043f\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u0435 \u2014 \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u043a\u0443\u0440\u0441\u043e\u0440\u0430, \u0440\u0438\u0442\u044a\u043c \u043d\u0430 \u0441\u043a\u0440\u043e\u043b\u0430, \u0432\u0440\u0435\u043c\u0435 \u2014 \u0430\u043d\u043e\u043d\u0438\u043c\u0435\u043d \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u044a\u043a, \u043a\u043e\u0439\u0442\u043e \u0441\u0442\u0430\u0432\u0430 \u043f\u043e\u0441\u0442\u043e\u044f\u043d\u0435\u043d \u0448\u0430\u0440\u0434 \u043e\u0442 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430\u0442\u0430. \u0411\u0435\u0437 \u043b\u0438\u0447\u043d\u0438 \u0434\u0430\u043d\u043d\u0438: \u0447\u0438\u0441\u0442\u0430 \u0435\u043d\u0442\u0440\u043e\u043f\u0438\u044f. \u0422\u043e\u0437\u0438 \u043c\u043e\u043d\u0443\u043c\u0435\u043d\u0442 \u043d\u0438\u043a\u043e\u0433\u0430 \u043d\u0435 \u043c\u043e\u0436\u0435 \u0434\u0430 \u043d\u0430\u043c\u0430\u043b\u0435\u0435. \u0412\u0435\u0447\u0435 \u0441\u0438 \u0447\u0430\u0441\u0442 \u043e\u0442 \u043d\u0435\u0433\u043e."
  },
  // ── CTA ──
  cta_title: { it: "HAI UN PROGETTO?", en: "GOT A PROJECT?", bg: "\u0418\u041C\u0410\u0428 \u041F\u0420\u041E\u0415\u041A\u0422?" },
  cta_sub: {
    it: "CARBONSTEALTH.EU \u2014 AVVICINA IL CURSORE E GUARDA LE LETTERE FUGGIRE",
    en: "CARBONSTEALTH.EU \u2014 HOVER AND WATCH THE LETTERS FLEE",
    bg: "CARBONSTEALTH.EU \u2014 \u041C\u0418\u041D\u0418 \u041E\u0422\u0422\u0423\u041A \u0418 \u0413\u041B\u0415\u0414\u0410\u0419 \u041A\u0410\u041A \u0411\u0423\u041A\u0412\u0418\u0422\u0415 \u0411\u042F\u0413\u0410\u0422"
  },
  cta_btn: { it: "CONTATTACI", en: "CONTACT US", bg: "\u0421\u0412\u042A\u0420\u0416\u0418 \u0421\u0415 \u0421 \u041D\u0410\u0421" },
  // ── FAQ ──
  faq_tag: { it: "// FAQ", en: "// FAQ", bg: "// \u0427\u0415\u0421\u0422\u0418 \u0412\u042A\u041F\u0420\u041E\u0421\u0418" },
  faq_title: { it: "DOMANDE FREQUENTI", en: "FAQ", bg: "\u0412\u042A\u041F\u0420\u041E\u0421\u0418 \u0418 \u041E\u0422\u0413\u041E\u0412\u041E\u0420\u0418" },
  // ── TICKER ──
  ticker: {
    it: "CARBONSTEALTH.EU \u2014 ACCETTIAMO PROGETTI Q3 2026 \u2014 WEB \u00d7 GAMES \u00d7 IOT \u00d7 FIVEM \u00d7 DESIGN \u2014 BOBOV DOL / REMOTO / EUROPA \u2014",
    en: "CARBONSTEALTH.EU \u2014 ACCEPTING PROJECTS Q3 2026 \u2014 WEB \u00d7 GAMES \u00d7 IOT \u00d7 FIVEM \u00d7 DESIGN \u2014 BOBOV DOL / REMOTE / EUROPE \u2014",
    bg: "CARBONSTEALTH.EU \u2014 \u041F\u0420\u0418\u0415\u041C\u0410\u041C\u0415 \u041F\u0420\u041E\u0415\u041A\u0422\u0418 Q3 2026 \u2014 \u0423\u0415\u0411 \u00d7 \u0418\u0413\u0420\u0418 \u00d7 IOT \u00d7 FIVEM \u00d7 \u0414\u0418\u0417\u0410\u0419\u041D \u2014 \u0411\u041E\u0411\u041E\u0412 \u0414\u041E\u041B / \u0414\u0418\u0421\u0422\u0410\u041D\u0426\u0418\u041E\u041D\u041D\u041E / \u0415\u0412\u0420\u041E\u041F\u0410 \u2014"
  },
  // ── FOOTER ──
  ft_servizi: { it: "SERVIZI", en: "SERVICES", bg: "\u0423\u0421\u041B\u0423\u0413\u0418" },
  ft_azienda: { it: "AZIENDA", en: "COMPANY", bg: "\u041A\u041E\u041C\u041F\u0410\u041D\u0418\u042F" },
  ft_legale: { it: "LEGALE", en: "LEGAL", bg: "\u041F\u0420\u0410\u0412\u041D\u0410 \u0418\u041D\u0424\u041E\u0420\u041C\u0410\u0426\u0418\u042F" },
  ft_desc: {
    it: "Sviluppo web, software ERP, app mobile e SEO/GEO/AEO per l'Europa. EIK BG208725180. Soluzioni digitali di eccellenza per imprese ambiziose.",
    en: "Web development, ERP software, mobile apps and SEO/GEO/AEO across Europe. EIK BG208725180. Premium digital solutions for ambitious businesses.",
    bg: "\u0423\u0435\u0431 \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430, ERP \u0441\u043E\u0444\u0442\u0443\u0435\u0440, \u043C\u043E\u0431\u0438\u043B\u043D\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438 SEO/GEO/AEO \u0437\u0430 \u0415\u0432\u0440\u043E\u043F\u0430. \u0415\u0418\u041A BG208725180. \u041F\u0440\u0435\u043C\u0438\u0443\u043C \u0434\u0438\u0433\u0438\u0442\u0430\u043B\u043D\u0438 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0437\u0430 \u0430\u043C\u0431\u0438\u0446\u0438\u043E\u0437\u043D\u0438 \u0431\u0438\u0437\u043D\u0435\u0441\u0438."
  },
  // ── COOKIE BANNER ──
  cookie_text: {
    it: "Questo sito utilizza cookie tecnici e analitici per migliorare la tua esperienza. Puoi accettare o rifiutare i cookie non essenziali.",
    en: "This website uses technical and analytics cookies to improve your experience. You can accept or reject non-essential cookies.",
    bg: "\u0422\u043E\u0437\u0438 \u0441\u0430\u0439\u0442 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u0438 \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u0447\u043D\u0438 \u0431\u0438\u0441\u043A\u0432\u0438\u0442\u043A\u0438. \u041C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u043F\u0440\u0438\u0435\u043C\u0435\u0442\u0435 \u0438\u043B\u0438 \u043E\u0442\u043A\u0430\u0436\u0435\u0442\u0435 \u043D\u0435\u0441\u044A\u0449\u0435\u0441\u0442\u0432\u0435\u043D\u0438\u0442\u0435."
  },
  cookie_accept: { it: "ACCETTA", en: "ACCEPT", bg: "\u041F\u0420\u0418\u0415\u041C\u0418" },
  cookie_reject: { it: "RIFIUTA", en: "REJECT", bg: "\u041E\u0422\u041A\u0410\u0416\u0418" },
  cookie_more: { it: "Politica Cookie", en: "Cookie Policy", bg: "\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0437\u0430 \u0411\u0438\u0441\u043A\u0432\u0438\u0442\u043A\u0438" },
  // ── CONTACT FORM ──
  form_name: { it: "Nome e Cognome", en: "Full Name", bg: "\u0418\u043C\u0435 \u0438 \u0424\u0430\u043C\u0438\u043B\u0438\u044F" },
  form_email: { it: "Email", en: "Email", bg: "\u0418\u043C\u0435\u0439\u043B" },
  form_phone: { it: "Telefono (opzionale)", en: "Phone (optional)", bg: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D (\u043D\u0435\u0437\u0430\u0434\u044A\u043B\u0436\u0438\u0442\u0435\u043B\u043D\u043E)" },
  form_msg: { it: "Descrivi il tuo progetto...", en: "Describe your project...", bg: "\u041E\u043F\u0438\u0448\u0435\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u0438..." },
  form_send: { it: "INVIA RICHIESTA", en: "SEND REQUEST", bg: "\u0418\u0417\u041F\u0420\u0410\u0422\u0418" },
  form_sent: { it: "Richiesta inviata! Ti risponderemo entro 24 ore.", en: "Request sent! We will reply within 24 hours.", bg: "\u0417\u0430\u044F\u0432\u043A\u0430\u0442\u0430 \u0435 \u0438\u0437\u043F\u0440\u0430\u0442\u0435\u043D\u0430! \u0429\u0435 \u043E\u0442\u0433\u043E\u0432\u043E\u0440\u0438\u043C \u0434\u043E 24 \u0447\u0430\u0441\u0430." },
  form_gdpr: {
    it: "Inviando questo modulo, acconsenti al trattamento dei tuoi dati personali secondo la nostra",
    en: "By submitting this form, you consent to the processing of your personal data according to our",
    bg: "\u0418\u0437\u043F\u0440\u0430\u0449\u0430\u0439\u043A\u0438 \u0442\u043E\u0437\u0438 \u0444\u043E\u0440\u043C\u0443\u043B\u044F\u0440, \u0412\u0438\u0435 \u0441\u0435 \u0441\u044A\u0433\u043B\u0430\u0441\u044F\u0432\u0430\u0442\u0435 \u0441 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430\u0442\u0430 \u043D\u0430 \u043B\u0438\u0447\u043D\u0438\u0442\u0435 \u0412\u0438 \u0434\u0430\u043D\u043D\u0438 \u0441\u044A\u0433\u043B\u0430\u0441\u043D\u043E \u043D\u0430\u0448\u0430\u0442\u0430"
  },
  // ── ADMIN ──
  admin_title: { it: "CS MONITOR \u2014 ADMIN", en: "CS MONITOR \u2014 ADMIN", bg: "CS \u041C\u041E\u041D\u0418\u0422\u041E\u0420 \u2014 \u0410\u0414\u041C\u0418\u041D" },
};

// Explicit language choice: ?lang= URL param or saved preference — overrides all detection
function explicitLang() {
  try {
    var q = new URLSearchParams(window.location.search).get("lang");
    if (q === "it" || q === "en" || q === "bg") { try{localStorage.setItem("cs_lang", q)}catch(e){} return q; }
    var saved = localStorage.getItem("cs_lang");
    if (saved === "it" || saved === "en" || saved === "bg") return saved;
  } catch (e) {}
  return null;
}
// Auto-detect language: explicit choice > IP geolocation > timezone fallback (instant)
function detectLang() {
  // ONLY timezone for instant detection — NOT browser language
  // Browser language = user preference (bg speaker in Italy should see IT)
  // Timezone = physical location (accurate)
  var explicit = explicitLang();
  if (explicit) return explicit;
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.indexOf("Rome") > -1) return "it";    // Italy timezone
    if (tz.indexOf("Sofia") > -1) return "bg";   // Bulgaria timezone
    return "en";                                   // Everywhere else
  } catch (e) { return "en"; }
}
// Smooth scroll to section
function scrollToId(id){var el=document.getElementById(id);if(el){var y=el.getBoundingClientRect().top+window.scrollY-70;window.scrollTo({top:y,behavior:"smooth"})}}
// Make an onClick <div>/<span> keyboard-operable (WCAG 2.1.1 / 4.1.2):
// returns props that add button role, focusability and Enter/Space activation.
function kb(fn,label){return {role:"button",tabIndex:0,"aria-label":label,onClick:fn,onKeyDown:function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();fn()}}}}
// Load the 680KB Three.js WebGL bundle only where it pays off: skip it on small
// screens, reduced-motion and data-saver, where it just hurts mobile LCP. The
// site keeps its many 2D canvas effects in those cases.
function should3D(){
  try{
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return false;
    if(window.innerWidth<768)return false;
    var c=navigator.connection;if(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||"")))return false;
    return true;
  }catch(e){return true;}
}
// IP-based country detection — DEFINITIVE, overrides timezone (HTTPS endpoint: ip-api.com free tier is HTTP-only and gets blocked as mixed content)
function detectLangByIP(callback) {
  fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var cc = (data.country_code || "").toUpperCase();
      if (cc === "IT") callback("it");
      else if (cc === "BG") callback("bg");
      else if (cc) callback("en");
      // no country code (rate limit / error) — keep timezone fallback
    })
    .catch(function() { /* keep timezone fallback */ });
}

// Service descriptions per language
var SRV_DATA = {
  it: [
    {n:"01",t:"Sviluppo Siti Web",d:"Siti vetrina, portali aziendali e landing page ad alta conversione. Design responsive e UX premium.",tags:"HTML5 / REACT / NEXT.JS / WORDPRESS"},
    {n:"02",t:"E-Commerce",d:"Negozi online completi con integrazione pagamenti, gestione magazzino e checkout ottimizzato.",tags:"WOOCOMMERCE / SHOPIFY / CUSTOM"},
    {n:"03",t:"Sviluppo Software",d:"Software su misura per automatizzare processi aziendali, integrare sistemi e creare workflow efficienti.",tags:"PYTHON / NODE.JS / API REST"},
    {n:"04",t:"ERP Professionale",d:"Sistemi ERP personalizzati per PMI e enterprise. Contabilita, magazzino, CRM, HR e produzione.",tags:"ERP CUSTOM / CRM / BI DASHBOARD"},
    {n:"05",t:"App Mobile",d:"Applicazioni iOS e Android native e cross-platform. Dalla UX allo sviluppo e pubblicazione.",tags:"REACT NATIVE / FLUTTER / SWIFT"},
    {n:"06",t:"Game Dev & Anti-Cheat",d:"Browser MMOs, FiveM resources, anti-cheat avanzati con euristiche comportamentali e analisi real-time.",tags:"FIVEM / LUA / SOCKET.IO / REDIS"},
    {n:"07",t:"SEO & GEO Avanzato",d:"Ottimizzazione motori di ricerca locale e internazionale. Google My Business, link building, SEO tecnico.",tags:"SEO ON-PAGE / GEO SEO / LOCAL SEO"},
    {n:"08",t:"AEO - Answer Engine Optimization",d:"Ottimizzazione per ChatGPT, Perplexity, Google SGE e Gemini. Il futuro della visibilita online.",tags:"CHATGPT / PERPLEXITY / SCHEMA FAQ"},
    {n:"09",t:"SEO Analytics & Trust",d:"Monitoraggio posizionamento, analisi concorrenza, trust factor check e report mensili data-driven.",tags:"ANALYTICS / TRUST SCORE / COMPETITOR"},
    {n:"10",t:"Hosting & Cloud",d:"Hosting gestito ad alte prestazioni con SSL gratuito, CDN globale, backup e SLA 99.9% uptime.",tags:"SSL / CDN / 99.9% UPTIME"},
    {n:"11",t:"Cybersecurity & Audit",d:"Audit di sicurezza, penetration testing, protezione DDoS e best practice OWASP.",tags:"PEN TEST / DDOS SHIELD / AES-256"},
    {n:"12",t:"Integrazioni API",d:"Integrazione con CRM, ERP, gestionali, pagamenti e sistemi terzi tramite API REST o webhook.",tags:"REST API / WEBHOOK / OAUTH 2.0"},
    {n:"13",t:"Reverse Engineering & Stampa 3D",d:"Ricostruzione CAD di parti meccaniche, analisi di firmware e protocolli. Stampa 3D di prototipi, ricambi e piccole serie.",tags:"CAD / STL / FDM / FIRMWARE"},
  ],
  en: [
    {n:"01",t:"Web Development",d:"Showcase sites, corporate portals and high-conversion landing pages. Responsive design and premium UX.",tags:"HTML5 / REACT / NEXT.JS / WORDPRESS"},
    {n:"02",t:"E-Commerce",d:"Complete online stores with payment integration, inventory management and optimized checkout.",tags:"WOOCOMMERCE / SHOPIFY / CUSTOM"},
    {n:"03",t:"Software Development",d:"Custom software to automate business processes, integrate systems and create efficient workflows.",tags:"PYTHON / NODE.JS / API REST"},
    {n:"04",t:"Professional ERP",d:"Custom ERP systems for SMEs and enterprises. Accounting, inventory, CRM, HR and production.",tags:"ERP CUSTOM / CRM / BI DASHBOARD"},
    {n:"05",t:"Mobile Apps",d:"Native and cross-platform iOS and Android applications. From UX design to development and publishing.",tags:"REACT NATIVE / FLUTTER / SWIFT"},
    {n:"06",t:"Game Dev & Anti-Cheat",d:"Browser MMOs, FiveM resources, advanced anti-cheat with behavioral heuristics and real-time analysis.",tags:"FIVEM / LUA / SOCKET.IO / REDIS"},
    {n:"07",t:"Advanced SEO & GEO",d:"Local and international search engine optimization. Google My Business, link building, technical SEO.",tags:"SEO ON-PAGE / GEO SEO / LOCAL SEO"},
    {n:"08",t:"AEO - Answer Engine Optimization",d:"Optimization for ChatGPT, Perplexity, Google SGE and Gemini. The future of online visibility.",tags:"CHATGPT / PERPLEXITY / SCHEMA FAQ"},
    {n:"09",t:"SEO Analytics & Trust",d:"Position monitoring, competitor analysis, trust factor checks and monthly data-driven reports.",tags:"ANALYTICS / TRUST SCORE / COMPETITOR"},
    {n:"10",t:"Hosting & Cloud",d:"Managed high-performance hosting with free SSL, global CDN, backups and 99.9% uptime SLA.",tags:"SSL / CDN / 99.9% UPTIME"},
    {n:"11",t:"Cybersecurity & Audit",d:"Security audits, penetration testing, DDoS protection and OWASP best practices.",tags:"PEN TEST / DDOS SHIELD / AES-256"},
    {n:"12",t:"API Integrations",d:"Integration with CRM, ERP, management tools, payments and third-party systems via REST API or webhook.",tags:"REST API / WEBHOOK / OAUTH 2.0"},
    {n:"13",t:"Reverse Engineering & 3D Printing",d:"CAD reconstruction of mechanical parts, firmware and protocol analysis. 3D printing of prototypes, spare parts and small batches.",tags:"CAD / STL / FDM / FIRMWARE"},
  ],
  bg: [
    {n:"01",t:"\u0423\u0435\u0431 \u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430",d:"\u0424\u0438\u0440\u043C\u0435\u043D\u0438 \u0441\u0430\u0439\u0442\u043E\u0432\u0435, \u043A\u043E\u0440\u043F\u043E\u0440\u0430\u0442\u0438\u0432\u043D\u0438 \u043F\u043E\u0440\u0442\u0430\u043B\u0438 \u0438 landing \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0438 \u0441 \u0432\u0438\u0441\u043E\u043A\u0430 \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F. \u0410\u0434\u0430\u043F\u0442\u0438\u0432\u0435\u043D \u0434\u0438\u0437\u0430\u0439\u043D \u0438 \u043F\u0440\u0435\u043C\u0438\u0443\u043C UX.",tags:"HTML5 / REACT / NEXT.JS / WORDPRESS"},
    {n:"02",t:"\u0415\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u0430 \u0422\u044A\u0440\u0433\u043E\u0432\u0438\u044F",d:"\u041F\u044A\u043B\u043D\u043E\u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u043D\u0438 \u043E\u043D\u043B\u0430\u0439\u043D \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0438 \u0441 \u043F\u043B\u0430\u0449\u0430\u043D\u0438\u044F, \u0441\u043A\u043B\u0430\u0434 \u0438 \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u0430\u043D checkout \u0437\u0430 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u043D\u0438 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0438.",tags:"WOOCOMMERCE / SHOPIFY / CUSTOM"},
    {n:"03",t:"\u0421\u043E\u0444\u0442\u0443\u0435\u0440\u043D\u0430 \u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430",d:"\u0421\u043E\u0444\u0442\u0443\u0435\u0440 \u043F\u043E \u043F\u043E\u0440\u044A\u0447\u043A\u0430 \u0437\u0430 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0430 \u0431\u0438\u0437\u043D\u0435\u0441 \u043F\u0440\u043E\u0446\u0435\u0441\u0438, \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F \u043D\u0430 \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u0438 \u0435\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u0438 \u0440\u0430\u0431\u043E\u0442\u043D\u0438 \u043F\u043E\u0442\u043E\u0446\u0438.",tags:"PYTHON / NODE.JS / API REST"},
    {n:"04",t:"\u041F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D ERP",d:"ERP \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u043F\u043E \u043F\u043E\u0440\u044A\u0447\u043A\u0430 \u0437\u0430 \u043C\u0430\u043B\u043A\u0438 \u0438 \u0441\u0440\u0435\u0434\u043D\u0438 \u0444\u0438\u0440\u043C\u0438. \u0421\u0447\u0435\u0442\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E, \u0441\u043A\u043B\u0430\u0434, CRM, \u0447\u043E\u0432\u0435\u0448\u043A\u0438 \u0440\u0435\u0441\u0443\u0440\u0441\u0438 \u0438 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u043E.",tags:"ERP CUSTOM / CRM / BI DASHBOARD"},
    {n:"05",t:"\u041C\u043E\u0431\u0438\u043B\u043D\u0438 \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F",d:"\u041D\u0430\u0442\u0438\u0432\u043D\u0438 \u0438 \u043A\u0440\u043E\u0441\u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435\u043D\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0437\u0430 iOS \u0438 Android. \u041E\u0442 UX \u0434\u0438\u0437\u0430\u0439\u043D \u0434\u043E \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0432\u0430\u043D\u0435 \u0432 App Store \u0438 Google Play.",tags:"REACT NATIVE / FLUTTER / SWIFT"},
    {n:"06",t:"\u0418\u0433\u0440\u0438 \u0438 Anti-Cheat",d:"\u0411\u0440\u0430\u0443\u0437\u044A\u0440 MMO \u0438\u0433\u0440\u0438, FiveM \u0440\u0435\u0441\u0443\u0440\u0441\u0438, \u0430\u043D\u0442\u0438\u0447\u0438\u0439\u0442 \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u0441 \u043F\u043E\u0432\u0435\u0434\u0435\u043D\u0447\u0435\u0441\u043A\u0438 \u0435\u0432\u0440\u0438\u0441\u0442\u0438\u043A\u0438 \u0438 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432 \u0440\u0435\u0430\u043B\u043D\u043E \u0432\u0440\u0435\u043C\u0435.",tags:"FIVEM / LUA / SOCKET.IO / REDIS"},
    {n:"07",t:"\u041F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u043D\u043E SEO \u0438 GEO",d:"\u041B\u043E\u043A\u0430\u043B\u043D\u0430 \u0438 \u043C\u0435\u0436\u0434\u0443\u043D\u0430\u0440\u043E\u0434\u043D\u0430 \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430 \u0442\u044A\u0440\u0441\u0430\u0447\u043A\u0438. Google My Business, \u043B\u0438\u043D\u043A \u0431\u0438\u043B\u0434\u0438\u043D\u0433, \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E SEO.",tags:"SEO ON-PAGE / GEO SEO / LOCAL SEO"},
    {n:"08",t:"AEO - Answer Engine \u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F",d:"\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430 ChatGPT, Perplexity, Google SGE \u0438 Gemini. \u0411\u044A\u0434\u0435\u0449\u0435\u0442\u043E \u043D\u0430 \u043E\u043D\u043B\u0430\u0439\u043D \u0432\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u0442\u0430 \u0435 \u0442\u0443\u043A.",tags:"CHATGPT / PERPLEXITY / SCHEMA FAQ"},
    {n:"09",t:"SEO \u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430",d:"\u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u043D\u0430 \u043F\u043E\u0437\u0438\u0446\u0438\u0438, \u0430\u043D\u0430\u043B\u0438\u0437 \u043D\u0430 \u043A\u043E\u043D\u043A\u0443\u0440\u0435\u043D\u0442\u0438, trust factor \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u043C\u0435\u0441\u0435\u0447\u043D\u0438 \u043E\u0442\u0447\u0435\u0442\u0438 \u0431\u0430\u0437\u0438\u0440\u0430\u043D\u0438 \u043D\u0430 \u0434\u0430\u043D\u043D\u0438.",tags:"ANALYTICS / TRUST SCORE / COMPETITOR"},
    {n:"10",t:"\u0425\u043E\u0441\u0442\u0438\u043D\u0433 \u0438 Cloud",d:"\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0432\u0430\u043D \u0445\u043E\u0441\u0442\u0438\u043D\u0433 \u0441 \u0432\u0438\u0441\u043E\u043A\u0430 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442, \u0431\u0435\u0437\u043F\u043B\u0430\u0442\u0435\u043D SSL, \u0433\u043B\u043E\u0431\u0430\u043B\u0435\u043D CDN \u0438 99.9% uptime \u0433\u0430\u0440\u0430\u043D\u0446\u0438\u044F.",tags:"SSL / CDN / 99.9% UPTIME"},
    {n:"11",t:"\u041A\u0438\u0431\u0435\u0440\u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442",d:"\u041E\u0434\u0438\u0442 \u043D\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442\u0442\u0430, penetration testing, DDoS \u0437\u0430\u0449\u0438\u0442\u0430 \u0438 \u043F\u0440\u0438\u043B\u0430\u0433\u0430\u043D\u0435 \u043D\u0430 OWASP \u043D\u0430\u0439-\u0434\u043E\u0431\u0440\u0438 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0438.",tags:"PEN TEST / DDOS SHIELD / AES-256"},
    {n:"12",t:"API \u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438",d:"\u0421\u0432\u044A\u0440\u0437\u0432\u0430\u043D\u0435 \u0441 CRM, ERP, \u043F\u043B\u0430\u0442\u0435\u0436\u043D\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u0438 \u0441\u043E\u0444\u0442\u0443\u0435\u0440 \u043D\u0430 \u0442\u0440\u0435\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438 \u0447\u0440\u0435\u0437 REST API \u0438\u043B\u0438 webhook.",tags:"REST API / WEBHOOK / OAUTH 2.0"},
    {n:"13",t:"Reverse Engineering \u0438 3D \u041F\u0435\u0447\u0430\u0442",d:"CAD \u0440\u0435\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u043D\u0430 \u043C\u0435\u0445\u0430\u043D\u0438\u0447\u043D\u0438 \u0447\u0430\u0441\u0442\u0438, \u0430\u043D\u0430\u043B\u0438\u0437 \u043D\u0430 \u0444\u044A\u0440\u043C\u0443\u0435\u0440 \u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0438. 3D \u043F\u0435\u0447\u0430\u0442 \u043D\u0430 \u043F\u0440\u043E\u0442\u043E\u0442\u0438\u043F\u0438, \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0438 \u0447\u0430\u0441\u0442\u0438 \u0438 \u043C\u0430\u043B\u043A\u0438 \u0441\u0435\u0440\u0438\u0438.",tags:"CAD / STL / FDM / FIRMWARE"},
  ],
};

// ═══════════════════════════════════════════════════════════════
// ADMIN STATS DASHBOARD — Secret panel for all CS sites
// Access: press Ctrl+Shift+A
// ═══════════════════════════════════════════════════════════════
function AdminPanel(props) {
  var [auth, setAuth] = useState(false);
  var [pwd, setPwd] = useState("");
  var [pwdErr, setPwdErr] = useState(false);
  var [tab, setTab] = useState("dashboard");
  var [stats, setStats] = useState({});
  var [loading, setLoading] = useState(true);
  var [selSite, setSelSite] = useState(null);
  var [campaigns, setCampaigns] = useState([]);
  var [campName, setCampName] = useState("");
  var [campSubj, setCampSubj] = useState("");
  var [campBody, setCampBody] = useState("");
  var [tasks, setTasks] = useState([]);
  var [taskText, setTaskText] = useState("");
  var [taskPri, setTaskPri] = useState("MEDIUM");
  var [clients, setClients] = useState([]);
  var [cliName, setCliName] = useState("");
  var [cliProj, setCliProj] = useState("");
  var [cliBudget, setCliBudget] = useState("");
  var [cfgSmtp, setCfgSmtp] = useState({host:"smtp.gmail.com",port:"587",user:"info@carbonstealth.eu",pass:"",to:"info@carbonstealth.eu"});
  var [cfgSaved, setCfgSaved] = useState(false);
  var [contacts, setContacts] = useState([]);
  var [actLog, setActLog] = useState([]);
  var [analyzerScans, setAnalyzerScans] = useState([]);
  var [analyzerLeads, setAnalyzerLeads] = useState([]);
  var [indexNowLog, setIndexNowLog] = useState([]);
  var [indexNowBusy, setIndexNowBusy] = useState(false);
  var [pingHistory, setPingHistory] = useState({});
  var [serverStats, setServerStats] = useState({connections:0,bandwidth:"0",requests_min:0,uptime:"0d",uptime_pct:"99.9%",load:"0",memory_used:0,memory_total:0,disk_used:0,disk_total:0,nginx_today:0,referrers:[],unique_visitors:0,top_ips:[],hourly:[],user_agents:{desktop:0,mobile:0,bot:0}});
  var [countries, setCountries] = useState({});
  var [tick, setTick] = useState(0);
  var C="#00e5ff",CR="0,229,255",HEAD="Inter Tight,sans-serif";
  // Admin auth: the typed password IS the server token (CS_ADMIN_TOKEN in the
  // PHP-FPM env). It is NEVER hardcoded in the bundle — it only exists in the
  // admin's session after they type it, and every API call sends it as a header.
  function csTok(){ try{return sessionStorage.getItem("cs_admin_token")||""}catch(e){return ""} }
  function csAuthFetch(url, opts){ opts=opts||{}; opts.headers=Object.assign({}, opts.headers||{}, {"X-CS-Token":csTok()}); return fetch(url, opts); }
  var F=1.35;

  var sites = [
    {name:"carbonstealth.eu",url:"https://carbonstealth.eu",label:"Carbon Stealth",type:"CORPORATE",tech:"React+Three.js+Vite",port:443,proto:"HTTPS/2",cdn:"Cloudflare"},
    {name:"ouvaptsarov.com",url:"https://ouvaptsarov.com",label:"OU Vaptsarov",type:"SCHOOL",tech:"React+Vite+PHP",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"nexus.carbonstealth.eu",url:"https://nexus.carbonstealth.eu",label:"Nexus Dominion",type:"MMO GAME",tech:"React+Node+PG+Redis",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"ac.carbonstealth.eu",url:"https://ac.carbonstealth.eu",label:"CS Anti-Cheat",type:"SECURITY",tech:"Python+Flask+PG",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"tretimart.carbonstealth.eu",url:"https://tretimart.carbonstealth.eu",label:"Treti Mart",type:"MARKETPLACE",tech:"React+Node+Stripe",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"erp.carbonstealth.eu",url:"https://erp.carbonstealth.eu",label:"ERP Ascensori",type:"ERP SYSTEM",tech:"React+Prisma+PG",port:443,proto:"HTTPS/2",cdn:"None"},
  ];

  async function checkPwd() {
    if (!pwd || pwd.length < 4) { setPwdErr(true); setPwd(""); return; }
    // Store the typed password as the session token, then verify it against the
    // server (a 401 means wrong password). No secret ships in the bundle.
    try{ sessionStorage.setItem("cs_admin_token", pwd); }catch(e){}
    try {
      var r = await fetch("/api/monitor.php", { headers: { "X-CS-Token": pwd } });
      if (r.status === 401) { try{sessionStorage.removeItem("cs_admin_token")}catch(e){} setPwdErr(true); setPwd(""); return; }
      setAuth(true); setPwdErr(false); setPwd("");
    } catch(e) {
      // Network/endpoint unreachable — allow entry (data tabs will show empty states)
      setAuth(true); setPwdErr(false); setPwd("");
    }
  }

  function doPing() {
    var r={},done=0;
    csAuthFetch("/api/monitor.php").then(function(res){return res.json()}).then(function(d){if(d.ok){setServerStats(d);
      if(d.top_ips&&d.top_ips.length&&Object.keys(countries).length===0){
        d.top_ips.slice(0,5).forEach(function(entry){
          // HTTPS endpoint — ip-api.com free tier is HTTP-only and gets blocked as mixed content
          fetch("https://ipapi.co/"+entry.ip+"/json/").then(function(r){return r.json()}).then(function(geo){
            setCountries(function(prev){var n=Object.assign({},prev);n[entry.ip]={country:geo.country_name||"Unknown",code:geo.country_code||"",city:geo.city||""};return n})
          }).catch(function(){})
        })
      }
    }}).catch(function(e){console.log("monitor err:",e)});
    sites.forEach(function(site){
      var t0=Date.now();
      fetch(site.url,{method:"HEAD",mode:"no-cors"}).then(function(){
        var lat=Date.now()-t0;
        r[site.name]={status:"ONLINE",latency:lat,time:new Date().toLocaleTimeString(),headers:site.proto,port:site.port};
        done++;
        setPingHistory(function(prev){var h=Object.assign({},prev);if(!h[site.name])h[site.name]=[];h[site.name]=h[site.name].concat([lat]).slice(-30);return h});
        if(done>=sites.length){setStats(Object.assign({},r));setLoading(false)}
      }).catch(function(){
        r[site.name]={status:"TIMEOUT",latency:-1,time:new Date().toLocaleTimeString(),headers:"N/A",port:site.port};
        done++;
        if(done>=sites.length){setStats(Object.assign({},r));setLoading(false)}
      });
    });
  }

  useEffect(function(){try{if(sessionStorage.getItem("cs_admin_token"))setAuth(true)}catch(e){}},[]);

  useEffect(function(){
    if(!auth)return;
    doPing();
    var iv=setInterval(function(){doPing();setTick(function(t){return t+1})},15000);
    try{setCampaigns(JSON.parse(localStorage.getItem("cs_camp")||"[]"))}catch(e){}
    try{setTasks(JSON.parse(localStorage.getItem("cs_tasks")||"[]"))}catch(e){}
    try{setClients(JSON.parse(localStorage.getItem("cs_clients")||"[]"))}catch(e){}
    try{var sc=JSON.parse(localStorage.getItem("cs_smtp")||"{}");if(sc.host)setCfgSmtp(sc)}catch(e){}
    csAuthFetch("/api/contact.php?action=log").then(function(r){return r.json()}).then(function(d){if(d.entries)setContacts(d.entries)}).catch(function(){});
    csAuthFetch("/api/analyze.php?action=stats").then(function(r){return r.json()}).then(function(d){if(d.ok){setAnalyzerScans(d.recent_scans||[]);setAnalyzerLeads(d.recent_leads||[])}}).catch(function(){});
    csAuthFetch("/api/indexnow.php?action=status").then(function(r){return r.json()}).then(function(d){if(d.ok)setIndexNowLog(d.submissions||[])}).catch(function(){});
    setActLog([{t:new Date().toLocaleTimeString(),a:"Admin session started — all systems nominal",c:"SYSTEM"}]);
    // SSE real-time lead notifications
    var sse=null;
    try{
      sse=new EventSource("/api/sse-leads.php?token="+encodeURIComponent(csTok()));
      sse.addEventListener("new_lead",function(e){
        try{
          var lead=JSON.parse(e.data);
          setAnalyzerLeads(function(prev){return [lead].concat(prev).slice(0,50)});
          setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"NEW LEAD: "+(lead.name||lead.email||"unknown")+" — "+(lead.tested_url||""),c:"LEAD"}].concat(prev).slice(0,100)});
        }catch(err){}
      });
      sse.addEventListener("connected",function(){
        setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"SSE connected — real-time lead stream active",c:"SYSTEM"}].concat(prev).slice(0,100)});
      });
      sse.onerror=function(){
        setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"SSE reconnecting...",c:"WARN"}].concat(prev).slice(0,100)});
      };
    }catch(err){}
    return function(){clearInterval(iv);if(sse)sse.close()};
  },[auth]);

  function save(key,data){try{localStorage.setItem(key,JSON.stringify(data))}catch(e){}}
  function saveCamp(){if(!campName.trim())return;var u=campaigns.concat([{id:Date.now(),name:campName,subject:campSubj,body:campBody,status:"DRAFT",date:new Date().toISOString().slice(0,10)}]);setCampaigns(u);save("cs_camp",u);setCampName("");setCampSubj("");setCampBody("")}
  function delCamp(id){var u=campaigns.filter(function(c){return c.id!==id});setCampaigns(u);save("cs_camp",u)}
  function addTask(){if(!taskText.trim())return;var u=tasks.concat([{id:Date.now(),text:taskText,pri:taskPri,done:false,date:new Date().toISOString().slice(0,10)}]);setTasks(u);save("cs_tasks",u);setTaskText("")}
  function togTask(id){var u=tasks.map(function(t){return t.id===id?Object.assign({},t,{done:!t.done}):t});setTasks(u);save("cs_tasks",u)}
  function delTask(id){var u=tasks.filter(function(t){return t.id!==id});setTasks(u);save("cs_tasks",u)}
  function addClient(){if(!cliName.trim())return;var u=clients.concat([{id:Date.now(),name:cliName,project:cliProj,budget:cliBudget,status:"ACTIVE",date:new Date().toISOString().slice(0,10)}]);setClients(u);save("cs_clients",u);setCliName("");setCliProj("");setCliBudget("")}
  function delClient(id){var u=clients.filter(function(c){return c.id!==id});setClients(u);save("cs_clients",u)}
  // Export any array of objects as a CSV download (admin convenience)
  function exportCSV(rows, name){
    if(!rows||!rows.length){alert("Nothing to export");return}
    var cols=Object.keys(rows[0]);
    var esc=function(v){v=v==null?"":String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
    var csv=cols.join(",")+"\n"+rows.map(function(r){return cols.map(function(c){return esc(r[c])}).join(",")}).join("\n");
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=name+"_"+new Date().toISOString().slice(0,10)+".csv";
    a.click();URL.revokeObjectURL(a.href);
  }
  function saveSMTP(){save("cs_smtp",cfgSmtp);setCfgSaved(true);setTimeout(function(){setCfgSaved(false)},3000);csAuthFetch("/api/admin-settings.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_smtp",data:cfgSmtp})}).catch(function(){})}

  var onN=Object.values(stats).filter(function(s){return s.status==="ONLINE"}).length;
  var totalRev=0;clients.forEach(function(c){totalRev+=parseFloat(c.budget)||0});
  var avgLat=0;var latVals=Object.values(stats).filter(function(s){return s.latency>0}).map(function(s){return s.latency});if(latVals.length)avgLat=Math.round(latVals.reduce(function(a,b){return a+b},0)/latVals.length);

  // ═══ SPARKLINE COMPONENT ═══
  function Spark(p){
    var ref=useRef(null);
    useEffect(function(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var data=p.data||[];if(data.length<2)return;
      var max=Math.max.apply(null,data)*1.2||1;var min=Math.min.apply(null,data)*0.8||0;
      var range=max-min||1;
      // Gradient fill
      var grad=ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,(p.color||"rgba(0,229,255,.3)"));grad.addColorStop(1,"rgba(0,229,255,0)");
      ctx.beginPath();ctx.moveTo(0,h);
      data.forEach(function(v,i){var x=(i/(data.length-1))*w;var y=h-((v-min)/range)*h;if(i===0)ctx.lineTo(x,y);else ctx.lineTo(x,y)});
      ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
      // Line
      ctx.beginPath();
      data.forEach(function(v,i){var x=(i/(data.length-1))*w;var y=h-((v-min)/range)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
      ctx.strokeStyle=p.lineColor||"#00e5ff";ctx.lineWidth=1.5;ctx.stroke();
      // Last dot
      if(data.length>0){var lastX=w;var lastY=h-((data[data.length-1]-min)/range)*h;ctx.beginPath();ctx.arc(lastX,lastY,3,0,Math.PI*2);ctx.fillStyle="#00e5ff";ctx.fill()}
    },[p.data,tick]);
    return React.createElement("canvas",{ref:ref,width:p.w||120,height:p.h||32,style:{display:"block"}});
  }

  // ═══ BAR CHART ═══
  function BarChart(p){
    var ref=useRef(null);
    var [hover,setHover]=useState(-1);
    var barPositions=useRef([]);
    function draw(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var data=p.data||[];if(!data.length)return;
      var max=Math.max.apply(null,data.map(function(d){return d.v}))||1;
      var bw=Math.floor((w-8)/(data.length))-2;
      var positions=[];
      data.forEach(function(d,i){
        var bh=(d.v/max)*(h-24);var x=4+i*(bw+2);var y=h-bh-14;
        positions.push({x:x,w:bw,y:y,h:bh});
        var isHover=hover===i;
        ctx.fillStyle=isHover?"rgba(0,229,255,.9)":"rgba(0,229,255,.5)";
        ctx.fillRect(x,y,bw,bh);
        if(isHover){ctx.fillStyle="rgba(0,229,255,.15)";ctx.fillRect(x,0,bw,h)}
        ctx.fillStyle=isHover?"#f5f5f0":"#666";ctx.font=(isHover?"bold ":"")+"7px monospace";ctx.textAlign="center";ctx.fillText(d.l||"",x+bw/2,h-2);
      });
      barPositions.current=positions;
      if(hover>=0&&hover<data.length){
        var d=data[hover];var bp=positions[hover];
        var ttText=d.l+"h: "+d.v+" req"+(d.visitors!==undefined?" | "+d.visitors+" visitors":"");
        ctx.font="bold 10px monospace";var tw=ctx.measureText(ttText).width+12;
        var tx=Math.min(Math.max(bp.x+bp.w/2-tw/2,2),w-tw-2);
        var ty=Math.max(bp.y-24,2);
        ctx.fillStyle="rgba(0,0,0,.9)";ctx.fillRect(tx,ty,tw,18);
        ctx.strokeStyle="rgba(0,229,255,.4)";ctx.lineWidth=1;ctx.strokeRect(tx,ty,tw,18);
        ctx.fillStyle="#00e5ff";ctx.textAlign="left";ctx.fillText(ttText,tx+6,ty+13);
      }
    }
    useEffect(draw,[p.data,hover]);
    function onMove(e){var cv=ref.current;if(!cv)return;var rect=cv.getBoundingClientRect();var mx=(e.clientX-rect.left)*(cv.width/rect.width);var found=-1;barPositions.current.forEach(function(bp,i){if(mx>=bp.x&&mx<=bp.x+bp.w)found=i});setHover(found)}
    function onLeave(){setHover(-1)}
    return React.createElement("canvas",{ref:ref,width:p.w||200,height:p.h||80,onMouseMove:onMove,onMouseLeave:onLeave,style:{display:"block",cursor:"crosshair"}});
  }

  // ═══ STYLES ═══
  var card=function(glow){return{background:"rgba(245,245,240,.02)",border:"1px solid rgba("+(glow||CR)+",.1)",padding:Math.round(16*F),position:"relative",overflow:"hidden"}};
  var cardGlow=function(color){return{position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba("+(color||CR)+",.4),transparent)"}};
  var lb={fontSize:Math.round(8*F),color:"#666",letterSpacing:".2em",marginBottom:4,textTransform:"uppercase"};
  var vl=function(color){return{fontSize:Math.round(28*F),fontFamily:HEAD,fontWeight:900,color:color||"#f5f5f0",lineHeight:1}};
  var ip={width:"100%",background:"rgba(245,245,240,.03)",border:"1px solid rgba(245,245,240,.08)",color:"#f5f5f0",padding:Math.round(10*F)+"px",fontSize:Math.round(11*F),fontFamily:"'Space Mono',monospace",outline:"none",marginBottom:Math.round(6*F)};
  var btn=function(color){return{display:"inline-block",padding:Math.round(7*F)+"px "+Math.round(16*F)+"px",border:"1px solid "+(color||C)+"44",color:color||C,fontSize:Math.round(9*F),letterSpacing:".1em",cursor:"crosshair",marginRight:6}};
  var ts=function(t){return{padding:Math.round(8*F)+"px "+Math.round(14*F)+"px",fontSize:Math.round(9*F),letterSpacing:".1em",cursor:"crosshair",border:"1px solid "+(tab===t?"rgba("+CR+",.3)":"rgba(245,245,240,.04)"),background:tab===t?"rgba("+CR+",.06)":"transparent",color:tab===t?C:"#999",transition:"all .2s"}};

  // ═══ LOGIN GATE ═══
  if (!auth) {
    return (
      React.createElement("div",{style:{position:"fixed",inset:0,background:"#000",zIndex:100000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace"}},
        React.createElement("div",{style:{width:"min(420px,92vw)",padding:"clamp(28px,6vw,48px)",border:"1px solid rgba("+CR+",.12)",background:"rgba(0,0,0,.95)",position:"relative",overflow:"hidden"}},
          React.createElement("div",{style:{position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba("+CR+",.5),transparent)"}}),
          React.createElement("img",{src:"/logo.png",alt:"CS",style:{height:36,marginBottom:24,display:"block",filter:"drop-shadow(0 0 12px rgba(0,229,255,.3))"}}),
          React.createElement("div",{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(22*F),color:"#f5f5f0",marginBottom:4}},"CS COMMAND CENTER"),
          React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#555",letterSpacing:".25em",marginBottom:32}},"SECURE ACCESS REQUIRED"),
          pwdErr && React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#ff3366",marginBottom:14,padding:"10px 14px",border:"1px solid rgba(255,51,102,.2)",background:"rgba(255,51,102,.05)"}},"ACCESS DENIED"),
          React.createElement("input",{type:"password",autoComplete:"current-password",value:pwd,onChange:function(e){setPwd(e.target.value)},onKeyDown:function(e){if(e.key==="Enter")checkPwd()},placeholder:"Enter password...",style:Object.assign({},ip,{marginBottom:16,fontSize:Math.round(13*F),padding:"14px 16px"})}),
          React.createElement("div",{style:{display:"flex",gap:10}},
            React.createElement("div",{onClick:checkPwd,style:{flex:1,padding:"14px",border:"1px solid rgba("+CR+",.3)",background:"rgba("+CR+",.06)",color:C,fontSize:Math.round(11*F),letterSpacing:".2em",cursor:"crosshair",textAlign:"center"}},"LOGIN"),
            React.createElement("div",{onClick:props.onClose,style:{padding:"14px 24px",border:"1px solid rgba(245,245,240,.08)",color:"#666",fontSize:Math.round(11*F),letterSpacing:".2em",cursor:"crosshair",textAlign:"center"}},"ESC")
          )
        )
      )
    );
  }

  // ═══ SITE DETAIL VIEW ═══
  function renderSiteDetail(site){
    var s=stats[site.name]||{};var on=s.status==="ONLINE";var history=pingHistory[site.name]||[];
    var sslDays=serverStats.ssl_days||0;
    var domDays=0;
    var avgPing=history.length?Math.round(history.reduce(function(a,b){return a+b},0)/history.length):0;
    var minPing=history.length?Math.min.apply(null,history):0;
    var maxPing=history.length?Math.max.apply(null,history):0;
    // Simulated connection data based on real latency
    // Real data from /api/monitor.php
    var conns=serverStats.connections||0;
    var bw=serverStats.bandwidth||"0";
    var reqs=serverStats.requests_min||0;
    var uptime=on?(serverStats.uptime||"loading..."):"DOWN";

    return React.createElement("div",null,
      React.createElement("div",{onClick:function(){setSelSite(null)},style:{fontSize:Math.round(10*F),color:C,cursor:"crosshair",marginBottom:Math.round(16*F)}},"\u2190 BACK TO ALL SITES"),
      // Header
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:Math.round(20*F)}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(28*F),color:"#f5f5f0",marginBottom:4}},site.label),
          React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#999"}},site.name," \u00b7 ",site.tech)
        ),
        React.createElement("div",{style:{padding:"8px 20px",border:"1px solid "+(on?"rgba(0,255,136,.3)":"rgba(255,51,102,.3)"),color:on?"#00ff88":"#ff3366",fontSize:Math.round(11*F),fontFamily:HEAD,fontWeight:700}},on?"ONLINE":"OFFLINE")
      ),
      // Connection metrics row
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"LATENCY"),React.createElement("div",{style:vl(s.latency>300?"#ff3366":s.latency>150?"#ffaa00":"#00ff88")},(s.latency||0)+"ms")),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"CONNECTIONS"),React.createElement("div",{style:vl()},conns)),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"BANDWIDTH"),React.createElement("div",{style:vl()},bw+"MB/s")),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"REQUESTS/MIN"),React.createElement("div",{style:vl()},reqs)),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"UPTIME"),React.createElement("div",{style:vl(on?"#00ff88":"#ff3366")},serverStats.uptime_pct||"..."))
      ),
      // Latency chart
      React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
        React.createElement("div",{style:cardGlow()}),
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
          React.createElement("div",{style:lb},"LATENCY HISTORY (LAST 30 PINGS)"),
          React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#999"}},"avg:",avgPing,"ms \u00b7 min:",minPing,"ms \u00b7 max:",maxPing,"ms")
        ),
        React.createElement(Spark,{data:history,w:800,h:80,lineColor:avgPing>300?"#ff3366":avgPing>150?"#ffaa00":"#00e5ff"})
      ),
      // Connection details grid
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:Math.round(10*F)}},
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow()}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"CONNECTION DETAILS"),
          [["Protocol","HTTPS/2"],["Port","443"],["SSL Issuer",serverStats.ssl_issuer||"checking..."],["SSL Expires",(serverStats.ssl_expires||"...")+" ("+(serverStats.ssl_days||"?")+"d)"],["Server","Nginx "+(serverStats.nginx_version||"...")+" / "+(serverStats.os||"...")],["IP",serverStats.server_ip||"..."],["TLS",(serverStats.tls_version||"...")+" / "+(serverStats.tls_cipher||"...")],["Load",serverStats.load||"0"],["Memory",(serverStats.memory_used||0)+"/"+(serverStats.memory_total||0)+"MB ("+(serverStats.memory_pct||0)+"%)"],["Disk",(serverStats.disk_used||0)+"/"+(serverStats.disk_total||0)+"GB ("+(serverStats.disk_pct||0)+"%)"]].map(function(row){
            return React.createElement("div",{key:row[0],style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(245,245,240,.03)",fontSize:Math.round(11*F)}},
              React.createElement("span",{style:{color:"#666"}},row[0]),
              React.createElement("span",{style:{color:row[0]==="SSL Expires"&&sslDays<30?"#ff3366":"#f5f5f0",fontFamily:HEAD,fontWeight:600}},row[1])
            )
          })
        ),
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("255,170,0")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"TRAFFIC BY HOUR (TODAY)"),
          React.createElement(BarChart,{w:400,h:120,data:(serverStats.hourly||[]).map(function(h){return {l:h.hour,v:h.count,visitors:h.visitors||0}})}),
          React.createElement("div",{style:{marginTop:12}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
              React.createElement("div",{style:lb},"TOP REFERRERS"),
              React.createElement("div",{style:{fontSize:Math.round(9*F),color:C}},serverStats.unique_visitors+" unique visitors")
            ),
            (serverStats.referrers&&serverStats.referrers.length?serverStats.referrers:[{host:"Loading...",pct:0,count:0}]).map(function(r){
              var text=typeof r==="string"?r:r.host+" \u2014 "+r.pct+"% ("+r.count+")";
              return React.createElement("div",{key:text,style:{display:"flex",justifyContent:"space-between",fontSize:Math.round(10*F),color:"#ccc",padding:"4px 0",borderBottom:"1px solid rgba(245,245,240,.02)"}},
                React.createElement("span",null,typeof r==="string"?r:r.host),
                React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:700}},typeof r==="string"?"":r.pct+"% ("+r.count+")")
              )
            })
          )
        )
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:Math.round(10*F),marginTop:Math.round(16*F)}},
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("170,136,255")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"TOP VISITORS BY COUNTRY"),
          (serverStats.top_ips||[]).slice(0,5).map(function(entry){
            var geo=countries[entry.ip]||{};
            return React.createElement("div",{key:entry.ip,style:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(245,245,240,.02)",fontSize:Math.round(10*F)}},
              React.createElement("span",{style:{color:"#ccc"}},geo.country?(geo.country+(geo.city?" ("+geo.city+")":"")):(entry.ip.substring(0,12)+"...")),
              React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:700}},entry.count+" req")
            )
          })
        ),
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("255,204,0")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"DEVICE BREAKDOWN"),
          [["Desktop",serverStats.user_agents?serverStats.user_agents.desktop:0,"#00e5ff"],["Mobile",serverStats.user_agents?serverStats.user_agents.mobile:0,"#00ff88"],["Bot/Crawler",serverStats.user_agents?serverStats.user_agents.bot:0,"#ffaa00"]].map(function(d){
            var total=(serverStats.user_agents?serverStats.user_agents.desktop+serverStats.user_agents.mobile+serverStats.user_agents.bot:1)||1;
            var pct=Math.round(d[1]/total*100);
            return React.createElement("div",{key:d[0],style:{marginBottom:8}},
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",fontSize:Math.round(10*F),marginBottom:3}},
                React.createElement("span",{style:{color:"#ccc"}},d[0]),
                React.createElement("span",{style:{color:d[2],fontFamily:HEAD,fontWeight:700}},d[1]+" ("+pct+"%)")
              ),
              React.createElement("div",{style:{height:4,background:"rgba(245,245,240,.04)",overflow:"hidden"}},
                React.createElement("div",{style:{width:pct+"%",height:"100%",background:d[2]}})
              )
            )
          })
        )
      ),
      React.createElement("div",{style:{marginTop:Math.round(16*F)}},
        React.createElement("a",{href:site.url,target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none",padding:"12px 28px"})},"\u2197 OPEN ",site.label.toUpperCase())
      )
    );
  }

  // ═══ MAIN DASHBOARD ═══
  return (
    React.createElement("div",{className:"cs-admin",style:{position:"fixed",inset:0,background:"#060608",zIndex:100000,overflowY:"auto",overflowX:"hidden",fontFamily:"'Space Mono',monospace",color:"#f5f5f0",fontSize:Math.round(12*F)}},
      React.createElement("style",null,"@media(max-width:760px){.cs-admin [style*='grid-template-columns']{grid-template-columns:1fr !important;gap:8px !important}.cs-admin [style*='display: flex']{flex-wrap:wrap !important;gap:6px !important}.cs-admin [style*='max-width: 1300']{padding:12px !important}.cs-admin{font-size:11px !important}.cs-admin *{max-width:100%;word-break:break-word;overflow-wrap:anywhere}}"),
      React.createElement("div",{style:{maxWidth:1300,margin:"0 auto",padding:Math.round(20*F)+"px"}},

        // HEADER
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:Math.round(16*F),marginBottom:Math.round(20*F),borderBottom:"1px solid rgba("+CR+",.08)"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:14}},
            React.createElement("div",{style:{width:10,height:10,borderRadius:"50%",background:onN===sites.length?"#00ff88":"#ff3366",boxShadow:"0 0 12px "+(onN===sites.length?"rgba(0,255,136,.5)":"rgba(255,51,102,.5)"),animation:"pulse 2s infinite"}}),
            React.createElement("img",{src:"/logo.png",alt:"CS",style:{height:Math.round(28*F),filter:"drop-shadow(0 0 8px rgba(0,229,255,.2))"}}),
            React.createElement("div",null,
              React.createElement("div",{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(16*F),letterSpacing:"-.01em"}},"CS COMMAND CENTER"),
              React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",letterSpacing:".2em"}},onN,"/",sites.length," SYSTEMS ONLINE \u00b7 v5.0")
            )
          ),
          React.createElement("div",{style:{display:"flex",gap:8,alignItems:"center"}},
            React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#555"}},new Date().toLocaleString()),
            React.createElement("div",{onClick:function(){doPing()},style:btn("#00ff88")},"REFRESH"),
            React.createElement("div",{onClick:function(){try{sessionStorage.removeItem("cs_admin_token")}catch(e){}setAuth(false)},style:btn("#ff3366")},"LOGOUT"),
            React.createElement("div",{onClick:props.onClose,style:btn()},"ESC")
          )
        ),

        // TABS
        React.createElement("div",{style:{display:"flex",gap:3,marginBottom:Math.round(20*F),flexWrap:"wrap"}},
          [["dashboard","\u25C8 DASHBOARD"],["sites","\u25CE SITES"],["contacts","\u2709 CONTACTS"],["analyzer","\u26A1 ANALYZER"],["indexnow","\u26A1 INDEXNOW"],["campaigns","\u25B6 CAMPAIGNS"],["crm","\u2605 CRM"],["revenue","\u20ac REVENUE"],["tasks","\u2713 TASKS"],["logs","\u25B7 LOGS"],["system","\u2699 SYSTEM"],["settings","\u2691 SETTINGS"]].map(function(t){return React.createElement("div",{key:t[0],onClick:function(){setTab(t[0]);setSelSite(null)},style:ts(t[0])},t[1])})
        ),

        // ═══ DASHBOARD ═══
        tab==="dashboard"&&React.createElement("div",null,
          // KPI row
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"SITES ONLINE"),React.createElement("div",{style:vl(onN===sites.length?"#00ff88":"#ff3366")},onN,"/",sites.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("0,255,136")}),React.createElement("div",{style:lb},"AVG LATENCY"),React.createElement("div",{style:vl(avgLat>300?"#ff3366":avgLat>150?"#ffaa00":"#00ff88")},avgLat,"ms")),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("255,170,0")}),React.createElement("div",{style:lb},"REQUESTS TODAY"),React.createElement("div",{style:vl()},serverStats.nginx_today||0)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("170,136,255")}),React.createElement("div",{style:lb},"UNIQUE VISITORS"),React.createElement("div",{style:vl()},serverStats.unique_visitors||0)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("255,204,0")}),React.createElement("div",{style:lb},"CONTACTS"),React.createElement("div",{style:vl()},contacts.length))
          ),
          // Quick actions
          React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:Math.round(20*F)}},
            React.createElement("div",{onClick:function(){
              if(indexNowBusy)return;setIndexNowBusy(true);
              csAuthFetch("/api/indexnow.php?action=bulk",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
                setIndexNowBusy(false);
                if(d.ok)alert("IndexNow: submitted "+d.submitted+" URLs");else alert("IndexNow error: "+(d.error||"?"));
              }).catch(function(){setIndexNowBusy(false);alert("IndexNow request failed")});
            },style:btn("#00ff88")},indexNowBusy?"\u23f3 SUBMITTING...":"\u26a1 INDEXNOW: SUBMIT ALL"),
            React.createElement("a",{href:"https://search.google.com/search-console",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 SEARCH CONSOLE"),
            React.createElement("a",{href:"https://www.bing.com/webmasters",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 BING WEBMASTER"),
            React.createElement("a",{href:"/sitemap.xml",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 SITEMAP"),
            React.createElement("div",{onClick:function(){setTab("contacts")},style:btn("#ffaa00")},"\u2709 LATEST LEADS")
          ),
          // Sites grid with sparklines
          React.createElement("div",{style:{marginBottom:Math.round(8*F)}},React.createElement("div",{style:Object.assign({},lb,{marginBottom:Math.round(10*F)})},"REAL-TIME MONITORING \u00b7 REFRESH EVERY 15s")),
          sites.map(function(site){
            var s=stats[site.name]||{};var on=s.status==="ONLINE";var lat=s.latency||0;
            var history=pingHistory[site.name]||[];
            return React.createElement("div",{key:site.name,onClick:function(){setTab("sites");setSelSite(site)},style:{display:"grid",gridTemplateColumns:"12px 1fr 100px 120px 80px 60px",gap:10,alignItems:"center",padding:Math.round(10*F)+"px 8px",borderBottom:"1px solid rgba(245,245,240,.03)",cursor:"crosshair",transition:"background .2s"}},
              React.createElement("div",{style:{width:8,height:8,borderRadius:"50%",background:on?"#00ff88":loading?"#ffaa00":"#ff3366",boxShadow:"0 0 6px "+(on?"rgba(0,255,136,.4)":"rgba(255,51,102,.4)")}}),
              React.createElement("div",null,
                React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(12*F)}},site.label),
                React.createElement("span",{style:{fontSize:Math.round(8*F),color:"#555",marginLeft:8}},site.type)
              ),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#666"}},site.name.split(".")[0]),
              React.createElement(Spark,{data:history,w:120,h:28}),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:lat>500?"#ff3366":lat>200?"#ffaa00":"#00ff88",fontFamily:HEAD,fontWeight:700,textAlign:"right"}},lat>0?lat+"ms":loading?"...":"DOWN"),
              React.createElement("span",{style:{fontSize:Math.round(8*F),color:C,textAlign:"right"}},"\u2192")
            )
          })
        ),

        // ═══ SITES ═══
        tab==="sites"&&(selSite?renderSiteDetail(selSite):React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(10*F)}},
            sites.map(function(site){
              var s=stats[site.name]||{};var on=s.status==="ONLINE";var history=pingHistory[site.name]||[];
              var sslD=serverStats.ssl_days||0;
              return React.createElement("div",{key:site.name,onClick:function(){setSelSite(site)},style:Object.assign({},card(on?CR:"255,51,102"),{cursor:"crosshair"})},
                React.createElement("div",{style:cardGlow(on?CR:"255,51,102")}),
                React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:12}},
                  React.createElement("span",{style:{fontFamily:HEAD,fontWeight:800,fontSize:Math.round(13*F)}},site.label),
                  React.createElement("span",{style:{fontSize:Math.round(8*F),color:on?"#00ff88":"#ff3366",padding:"2px 8px",border:"1px solid"}},s.status||"...")
                ),
                React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#666",marginBottom:8}},site.type," \u00b7 ",site.tech),
                React.createElement(Spark,{data:history,w:250,h:36}),
                React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:Math.round(9*F)}},
                  React.createElement("span",{style:{color:"#999"}},"Ping: ",React.createElement("span",{style:{color:on?"#00ff88":"#ff3366"}},(s.latency||0)+"ms")),
                  React.createElement("span",{style:{color:(serverStats.ssl_days||0)<30?"#ff3366":(serverStats.ssl_days||0)<60?"#ffaa00":"#999"}},"SSL: ",(serverStats.ssl_days||"?"),"d")
                )
              )
            })
          )
        )),

        // ═══ CONTACTS ═══
        tab==="contacts"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:Math.round(14*F)}},
            React.createElement("div",{style:lb},"FORM SUBMISSIONS (",contacts.length,")"),
            React.createElement("div",{style:{display:"flex",gap:6}},
              React.createElement("div",{onClick:function(){exportCSV(contacts,"cs_leads")},style:btn("#00ff88")},"\u2913 EXPORT CSV"),
              React.createElement("div",{onClick:function(){csAuthFetch("/api/contact.php?action=log").then(function(r){return r.json()}).then(function(d){if(d.entries)setContacts(d.entries)}).catch(function(){})},style:btn()},"\u21bb REFRESH")
            )
          ),
          contacts.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(245,245,240,.04)",color:"#555"}},"No submissions yet"),
          contacts.map(function(c,i){return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(245,245,240,.04)"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(13*F)}},c.name||"\u2014"),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#666"}},c.date||"")
            ),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:C}},c.email||""," ",c.phone?" \u00b7 "+c.phone:""),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#999",marginTop:4}},c.message||"")
          )})
        ),

        // ═══ ANALYZER TAB ═══
        tab==="analyzer"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"TOTAL SCANS"),React.createElement("div",{style:vl()},analyzerScans.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("0,255,136")}),React.createElement("div",{style:lb},"TOTAL LEADS"),React.createElement("div",{style:vl("#00ff88")},analyzerLeads.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("255,204,0")}),React.createElement("div",{style:lb},"CONVERSION RATE"),React.createElement("div",{style:vl()},analyzerScans.length>0?Math.round(analyzerLeads.length/analyzerScans.length*100)+"%":"—"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:Math.round(14*F)}},
            React.createElement("div",{style:lb},"RECENT LEADS ("+analyzerLeads.length+")"),
            React.createElement("div",{onClick:function(){csAuthFetch("/api/analyze.php?action=stats").then(function(r){return r.json()}).then(function(d){if(d.ok){setAnalyzerScans(d.recent_scans||[]);setAnalyzerLeads(d.recent_leads||[])}})},style:btn()},"\u21bb REFRESH")
          ),
          analyzerLeads.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(245,245,240,.04)",color:"#555"}},"No leads from /test/ yet"),
          analyzerLeads.map(function(l,i){return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(245,245,240,.04)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
            React.createElement("div",null,
              React.createElement("div",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(13*F),marginBottom:4}},l.name||"\u2014"),
              React.createElement("div",{style:{fontSize:Math.round(10*F),color:C}},l.email||""," ",l.phone?" \u00b7 "+l.phone:""),
              l.message&&React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#999",marginTop:4}},l.message)
            ),
            React.createElement("div",{style:{textAlign:"right"}},
              React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#666"}},l.ts?new Date(l.ts).toLocaleString():""),
              l.tested_url&&React.createElement("a",{href:l.tested_url,target:"_blank",rel:"noopener",style:{fontSize:Math.round(10*F),color:"#00e5ff",textDecoration:"none",display:"block",marginTop:4,wordBreak:"break-all"}},"\u25b6 "+l.tested_url)
            )
          )}),
          React.createElement("div",{style:{marginTop:Math.round(20*F),borderTop:"1px solid rgba(245,245,240,.04)",paddingTop:Math.round(14*F)}}),
          React.createElement("div",{style:lb},"RECENT SCANS ("+analyzerScans.length+")"),
          analyzerScans.length===0&&React.createElement("div",{style:{padding:Math.round(20*F),textAlign:"center",color:"#555",fontSize:Math.round(10*F)}},"No scans with consent yet"),
          analyzerScans.slice(0,15).map(function(s,i){
            var perf=s.perf_mobile;
            var pColor=perf>=80?"#00ff88":perf>=50?"#ffaa00":"#ff3366";
            return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"1fr 80px 80px 140px",gap:10,padding:Math.round(10*F)+"px 0",borderBottom:"1px solid rgba(245,245,240,.02)",alignItems:"center"}},
              React.createElement("a",{href:s.url,target:"_blank",rel:"noopener",style:{color:"#ccc",textDecoration:"none",fontSize:Math.round(11*F),wordBreak:"break-all"}},s.host||s.url),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:pColor,fontFamily:HEAD,fontWeight:800,textAlign:"center"}},"P: "+(perf||"?")),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:"#999",fontFamily:HEAD,fontWeight:700,textAlign:"center"}},"S: "+(s.seo_mobile||"?")),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#666",textAlign:"right"}},s.ts?new Date(s.ts).toLocaleString():"")
            )
          })
        ),

        // ═══ INDEXNOW TAB ═══
        tab==="indexnow"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:8})},"INDEXNOW \u2014 INSTANT BING/YANDEX INDEXING"),
            React.createElement("div",{style:{fontSize:Math.round(11*F),color:"#888",marginBottom:12,lineHeight:1.6}},"Submit URLs to Bing, Yandex, Seznam, Naver for near-instant indexing. Use after publishing new content or major updates."),
            React.createElement("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
              React.createElement("div",{onClick:function(){
                if(indexNowBusy)return;
                setIndexNowBusy(true);
                csAuthFetch("/api/indexnow.php?action=bulk",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
                  setIndexNowBusy(false);
                  if(d.ok){alert("Submitted "+d.submitted+" URLs to "+Object.keys(d.endpoints||{}).length+" engines");csAuthFetch("/api/indexnow.php?action=status").then(function(r){return r.json()}).then(function(dd){if(dd.ok)setIndexNowLog(dd.submissions||[])})}
                  else alert("Error: "+(d.error||"unknown"))
                }).catch(function(e){setIndexNowBusy(false);alert("Network error")});
              },style:Object.assign({},btn(),{background:indexNowBusy?"rgba(255,170,0,.1)":"rgba(0,229,255,.06)"})},indexNowBusy?"\u25CF SUBMITTING...":"\u25B6 SUBMIT ALL SITEMAPS"),
              React.createElement("a",{href:"/sitemap.xml",target:"_blank",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 VIEW SITEMAP")
            )
          ),
          React.createElement("div",{style:lb},"SUBMISSION HISTORY ("+indexNowLog.length+")"),
          indexNowLog.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(245,245,240,.04)",color:"#555"}},"No submissions yet"),
          indexNowLog.map(function(s,i){
            var eps=s.results||{};
            return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(245,245,240,.04)"}},
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
                React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(12*F)}},(s.url_count||0)+" URLs submitted"),
                React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#666"}},s.ts?new Date(s.ts).toLocaleString():"")
              ),
              React.createElement("div",{style:{display:"flex",gap:12,fontSize:Math.round(10*F),flexWrap:"wrap"}},
                Object.keys(eps).map(function(host){
                  var r=eps[host];
                  return React.createElement("span",{key:host,style:{padding:"3px 10px",border:"1px solid "+(r.success?"rgba(0,255,136,.3)":"rgba(255,51,102,.3)"),color:r.success?"#00ff88":"#ff3366",borderRadius:4}},host+" \u00b7 "+r.http_code)
                })
              )
            )
          })
        ),

        // ═══ CAMPAIGNS ═══
        tab==="campaigns"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"NEW CAMPAIGN"),
            React.createElement("input",{value:campName,onChange:function(e){setCampName(e.target.value)},placeholder:"Campaign name...",style:ip}),
            React.createElement("input",{value:campSubj,onChange:function(e){setCampSubj(e.target.value)},placeholder:"Subject...",style:ip}),
            React.createElement("textarea",{value:campBody,onChange:function(e){setCampBody(e.target.value)},placeholder:"Body...",rows:3,style:Object.assign({},ip,{resize:"vertical"})}),
            React.createElement("div",{onClick:saveCamp,style:btn()},"CREATE")
          ),
          campaigns.map(function(c){return React.createElement("div",{key:c.id,style:{padding:Math.round(12*F),borderBottom:"1px solid rgba(245,245,240,.04)"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),React.createElement("span",{style:{fontSize:Math.round(9*F),color:c.status==="SENT"?"#00ff88":"#ffaa00"}},"[",c.status,"]")),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#999",margin:"6px 0"}},c.subject||""),
            React.createElement("div",{onClick:function(){delCamp(c.id)},style:btn("#ff3366")},"DELETE")
          )})
        ),

        // ═══ CRM ═══
        tab==="crm"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:Math.round(10*F)}},
            React.createElement("div",{onClick:function(){exportCSV(clients,"cs_clients")},style:btn("#00ff88")},"\u2913 EXPORT CSV")
          ),
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"ADD CLIENT"),
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 120px",gap:6}},
              React.createElement("input",{value:cliName,onChange:function(e){setCliName(e.target.value)},placeholder:"Name...",style:ip}),
              React.createElement("input",{value:cliProj,onChange:function(e){setCliProj(e.target.value)},placeholder:"Project...",style:ip}),
              React.createElement("input",{value:cliBudget,onChange:function(e){setCliBudget(e.target.value)},placeholder:"\u20ac Budget",style:ip})
            ),
            React.createElement("div",{onClick:addClient,style:btn()},"ADD")
          ),
          clients.map(function(c){return React.createElement("div",{key:c.id,style:{display:"grid",gridTemplateColumns:"1fr 1fr 90px 60px 40px",gap:8,padding:Math.round(8*F)+"px 0",borderBottom:"1px solid rgba(245,245,240,.03)",alignItems:"center"}},
            React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),
            React.createElement("span",{style:{color:"#ccc"}},c.project),
            React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:900}},"\u20ac",c.budget),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:"#00ff88"}},c.status),
            React.createElement("span",{onClick:function(){delClient(c.id)},style:{color:"#ff3366",cursor:"crosshair",fontSize:Math.round(9*F)}},"\u2715")
          )})
        ),

        // ═══ REVENUE ═══
        tab==="revenue"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(10*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"TOTAL REVENUE"),React.createElement("div",{style:vl()},"\u20ac",totalRev.toLocaleString())),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("0,255,136")}),React.createElement("div",{style:lb},"CLIENTS"),React.createElement("div",{style:vl()},clients.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("170,136,255")}),React.createElement("div",{style:lb},"AVG PROJECT"),React.createElement("div",{style:vl()},"\u20ac",clients.length?Math.floor(totalRev/clients.length).toLocaleString():"0"))
          ),
          clients.map(function(c){return React.createElement("div",{key:c.id,style:{display:"grid",gridTemplateColumns:"1fr 1fr 100px",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(245,245,240,.03)"}},
            React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),React.createElement("span",{style:{color:"#ccc"}},c.project),React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:900}},"\u20ac",c.budget))})
        ),

        // ═══ TASKS ═══
        tab==="tasks"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 100px 70px",gap:6,marginBottom:Math.round(14*F)}},
            React.createElement("input",{value:taskText,onChange:function(e){setTaskText(e.target.value)},placeholder:"New task...",style:ip,onKeyDown:function(e){if(e.key==="Enter")addTask()}}),
            React.createElement("select",{value:taskPri,onChange:function(e){setTaskPri(e.target.value)},style:ip},React.createElement("option",{value:"HIGH"},"HIGH"),React.createElement("option",{value:"MEDIUM"},"MED"),React.createElement("option",{value:"LOW"},"LOW")),
            React.createElement("div",{onClick:addTask,style:Object.assign({},btn(),{textAlign:"center",padding:"10px 0"})},"ADD")
          ),
          tasks.map(function(t){var pc={HIGH:"#ff3366",MEDIUM:"#ffaa00",LOW:"#00ff88"}[t.pri];return React.createElement("div",{key:t.id,style:{display:"grid",gridTemplateColumns:"24px 1fr 50px 30px",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(245,245,240,.03)",alignItems:"center",opacity:t.done?.35:1}},
            React.createElement("div",{onClick:function(){togTask(t.id)},style:{width:16,height:16,border:"1px solid "+(t.done?"#00ff88":"#555"),display:"flex",alignItems:"center",justifyContent:"center",cursor:"crosshair",color:"#00ff88",fontSize:11}},t.done?"\u2713":""),
            React.createElement("span",{style:{textDecoration:t.done?"line-through":"none"}},t.text),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:pc}},t.pri),
            React.createElement("span",{onClick:function(){delTask(t.id)},style:{color:"#ff3366",cursor:"crosshair"}},"\u2715")
          )})
        ),

        // ═══ LOGS ═══
        tab==="logs"&&React.createElement("div",null,
          actLog.map(function(l,i){return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"70px 80px 1fr",gap:8,padding:"7px 0",borderBottom:"1px solid rgba(245,245,240,.02)"}},
            React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#555"}},l.t),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:C,padding:"2px 6px",border:"1px solid rgba("+CR+",.15)",textAlign:"center"}},l.c),
            React.createElement("span",null,l.a)
          )})
        ),

        // ═══ SYSTEM ═══
        tab==="system"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            [["VPS",serverStats.server_ip||"...","#00e5ff"],["PROVIDER","Hetzner NBG1","#00ff88"],["OS",serverStats.os||"...","#ffaa00"],["NGINX","Nginx "+(serverStats.nginx_version||"..."),"#aa88ff"],["PHP",serverStats.php_version||"...","#00e5ff"],["SSL",serverStats.ssl_issuer||"...","#00ff88"],["SSL EXPIRES",(serverStats.ssl_expires||"...")+" ("+(serverStats.ssl_days||"?")+"d)","#ffaa00"],["TLS",(serverStats.tls_version||"..."),"#ff3366"],["LOAD",serverStats.load||"0","#00e5ff"],["MEMORY",(serverStats.memory_pct||0)+"%","#00ff88"],["DISK",(serverStats.disk_pct||0)+"%","#ffaa00"],["PROCESSES",(serverStats.processes||0)+"","#aa88ff"]].map(function(it){
              return React.createElement("div",{key:it[0],style:card()},
                React.createElement("div",{style:cardGlow(it[2]?it[2].replace("#","").match(/.{2}/g).map(function(h){return parseInt(h,16)}).join(","):CR)}),
                React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",letterSpacing:".15em",marginBottom:4}},it[0]),
                React.createElement("div",{style:{fontSize:Math.round(13*F),fontFamily:HEAD,fontWeight:700,color:it[2]||"#f5f5f0"}},it[1])
              )
            })
          )
        ),

        // ═══ SETTINGS ═══
        tab==="settings"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(20*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:14})},"SMTP / EMAIL CONFIG"),
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",marginBottom:2}},"HOST"),React.createElement("input",{value:cfgSmtp.host,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{host:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",marginBottom:2}},"PORT"),React.createElement("input",{value:cfgSmtp.port,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{port:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",marginBottom:2}},"USERNAME"),React.createElement("input",{value:cfgSmtp.user,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{user:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",marginBottom:2}},"PASSWORD"),React.createElement("input",{type:"password",value:cfgSmtp.pass,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{pass:e.target.value}))},placeholder:"App password...",style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#555",marginBottom:2}},"RECIPIENT"),React.createElement("input",{value:cfgSmtp.to,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{to:e.target.value}))},style:ip}))
            ),
            React.createElement("div",{style:{display:"flex",gap:8,marginTop:12,alignItems:"center"}},
              React.createElement("div",{onClick:saveSMTP,style:btn()},"SAVE CONFIG"),
              cfgSaved&&React.createElement("span",{style:{color:"#00ff88",fontSize:Math.round(10*F)}},"SAVED!")
            )
          ),
          React.createElement("div",{style:card()},
            React.createElement("div",{style:cardGlow("255,51,102")}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"ADMIN ACCESS"),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#999",lineHeight:1.9}},
              "Access is controlled server-side. The admin password is the ",
              React.createElement("code",{style:{color:C}},"CS_ADMIN_TOKEN")," value in the PHP-FPM pool config:",
              React.createElement("br",null),
              React.createElement("code",{style:{color:"#00ff88",fontSize:Math.round(9*F),wordBreak:"break-all"}},"env[CS_ADMIN_TOKEN] = your-long-random-password"),
              React.createElement("br",null),
              "To change it: edit that line, run ",React.createElement("code",{style:{color:C}},"systemctl restart php8.5-fpm"),", then log in again. No rebuild needed and no secret ships in the browser."
            )
          )
        )

      ),
      // Pulse animation
      React.createElement("style",null,"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}")
    )
  );
}





// ═══════════════════════════════════════════════════════════════
// SEO / GEO / AEO — Nuclear-level optimization
// Injects meta tags, JSON-LD, Open Graph, GeoMeta into document.head
// ═══════════════════════════════════════════════════════════════
function SEOInjector() {
  useEffect(function() {
    // Title comes from the static index.html <head> (Italian, keyword-rich) —
    // overriding it here with an English string would undo the SEO title.

    // ── Meta tags ──
    var metas = [
      { name: "description", content: "Carbon Stealth VCC is a digital solutions agency based in Bobov Dol, Bulgaria. Web development, game development, FiveM scripting, embedded systems, IoT, PLC programming, and industrial automation. React, Node.js, Three.js, Docker, PostgreSQL." },
      { name: "keywords", content: "digital agency, web development, Bulgaria, Bobov Dol, React, Node.js, FiveM, game development, embedded systems, PLC, Modbus, IoT, Three.js, WebGL, Docker, carbon fiber, e-commerce" },
      { name: "author", content: "Carbon Stealth VCC" },
      { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large" },
      { name: "googlebot", content: "index, follow" },
      { name: "language", content: "en" },
      { name: "revisit-after", content: "3 days" },
      { name: "rating", content: "general" },
      { name: "theme-color", content: "#00e5ff" },
      // GEO Meta
      { name: "geo.region", content: "BG-KY" },
      { name: "geo.placename", content: "Bobov Dol" },
      { name: "geo.position", content: "42.3482;23.0017" },
      { name: "ICBM", content: "42.3482, 23.0017" },
      // Open Graph
      { property: "og:title", content: "Carbon Stealth VCC | Digital Solutions Agency" },
      { property: "og:description", content: "We build what others won't touch. Web development, game dev, FiveM, IoT, embedded systems. Based in Bulgaria." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://carbonstealth.eu" },
      { property: "og:site_name", content: "Carbon Stealth VCC" },
      { property: "og:locale", content: "en_US" },
      { property: "og:locale:alternate", content: "it_IT" },
      { property: "og:locale:alternate", content: "bg_BG" },
      { property: "og:image", content: "https://carbonstealth.eu/logo.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Carbon Stealth VCC Logo" },
      
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Carbon Stealth VCC | Digital Solutions Agency" },
      { name: "twitter:description", content: "Web development, game dev, IoT, embedded systems. Based in Bulgaria." },
      // Dublin Core
      { name: "DC.title", content: "Carbon Stealth VCC — Digital Solutions Agency" },
      { name: "DC.creator", content: "Carbon Stealth VCC" },
      { name: "DC.subject", content: "web development, software, ERP, SEO, game development, IoT" },
      { name: "DC.description", content: "Digital agency in Bobov Dol, Bulgaria. Web, software, ERP, games, IoT, SEO/GEO/AEO." },
      { name: "DC.publisher", content: "Carbon Stealth VCC" },
      { name: "DC.language", content: "it" },
      { name: "DC.coverage", content: "Europe" },
      { name: "DC.rights", content: "Copyright 2025-2026 Carbon Stealth VCC" },
    ];

    metas.forEach(function(m) {
      // The static index.html head is the source of truth — only add tags it
      // doesn't already have, so we never end up with two conflicting
      // descriptions / og:image / robots values after hydration.
      var sel = m.name ? 'meta[name="' + m.name + '"]' : 'meta[property="' + m.property + '"]';
      if (document.head.querySelector(sel)) return;
      var el = document.createElement("meta");
      Object.keys(m).forEach(function(k) { el.setAttribute(k, m[k]); });
      document.head.appendChild(el);
    });


    // ── Apple cursor ──


    // ── Responsive CSS ──
    var respStyle = document.createElement("style");
    respStyle.textContent = `
      /* ═══ MOBILE FIRST RESPONSIVE ═══ */
      
      /* Hamburger button */
      .cs-hamburger { display:none; width:32px; height:32px; flex-direction:column; justify-content:center; align-items:center; gap:5px; background:none; border:1px solid rgba(0,229,255,.2); padding:6px; }
      .cs-hamburger span { display:block; width:16px; height:1.5px; background:#00e5ff; transition:all .3s; }
      
      /* Mobile menu overlay */
      .cs-mobile-menu { display:none; position:fixed; top:0; left:0; width:100%; height:100vh; background:rgba(0,0,0,.97); z-index:99999; flex-direction:column; align-items:center; justify-content:center; gap:24px; backdrop-filter:blur(12px); }
      .cs-mobile-menu.open { display:flex; }
      .cs-mobile-menu-item { font-size:14px; letter-spacing:.3em; color:#ccc; padding:12px 24px; border:1px solid rgba(245,245,240,.06); min-width:200px; text-align:center; }
      .cs-mobile-menu-close { position:absolute; top:16px; right:16px; width:40px; height:40px; border:1px solid rgba(0,229,255,.2); display:flex; align-items:center; justify-content:center; color:#00e5ff; font-size:18px; }
      
      /* PHONE: < 768px */
      @media(max-width:767px) {
        /* Navbar */
        .cs-hamburger { display:flex !important; }
        .cs-nav-links { display:none !important; }
        .cs-nav-meta { display:none !important; }
        .cs-nav-lang { margin-left:auto; }
        
        /* About: stack columns */
        #about { grid-template-columns:1fr !important; gap:32px !important; padding:60px 16px !important; }
        
        /* Services: stack number + text */
        #services { padding:60px 16px !important; }
        #services > div > div[style*="grid"] { grid-template-columns:1fr !important; }
        
        /* Products: single column */
        #products > div[style*="grid"] { grid-template-columns:1fr !important; }
        #products { padding:40px 16px 60px !important; }
        
        /* Portfolio: simplify */
        #portfolio { padding:40px 16px 60px !important; }
        #portfolio a[style*="grid"] { grid-template-columns:40px 1fr !important; }
        #portfolio a span:last-child { display:none; }
        
        /* Reverse Lab */
        #lab { padding:40px 16px 60px !important; }
        
        /* Contact form: stack inputs */
        #contact { padding:60px 16px !important; }
        #contact div[style*="1fr 1fr"] { grid-template-columns:1fr !important; }
        
        /* FAQ */
        #faq { padding:60px 16px !important; }
        
        /* Footer: single column */
        footer > div[style*="grid"] { grid-template-columns:1fr !important; gap:24px !important; padding:40px 16px 24px !important; }
        
        /* Hero padding */
        #hero { padding:12px !important; }
        
        /* Cookie banner stack */
        .cs-cookie { flex-direction:column !important; text-align:center; }
        
        /* Hide decorative elements */
        .cs-scroll-indicator { display:none !important; }
        
        /* Diagonal dividers smaller */
        div[style*="linear-gradient(170deg"] { height:40px !important; }
        div[style*="linear-gradient(10deg"] { height:40px !important; }
      }
      
      /* TABLET: 768px - 1024px */
      @media(min-width:768px) and (max-width:1024px) {
        .cs-hamburger { display:none; }
        .cs-nav-links > div { gap:12px !important; }
        
        #about { gap:40px !important; padding:80px 20px !important; }
        footer > div[style*="grid"] { grid-template-columns:1fr 1fr !important; gap:24px !important; }
      }
      
      /* Touch-friendly targets */
      @media(pointer:coarse) {
        a, button, [onclick], div[style*="cursor"] { min-height:44px; min-width:44px; }
        input, textarea, select { font-size:16px !important; } /* prevents iOS zoom */
      }
      
      /* Safe area for notch phones */
      @supports(padding: env(safe-area-inset-top)) {
        nav { padding-top:max(12px, env(safe-area-inset-top)) !important; }
        footer { padding-bottom:max(20px, env(safe-area-inset-bottom)) !important; }
      }

      /* ── Accessibility (WCAG 2.2 AA) ── */
      /* Visible keyboard focus on every interactive element */
      a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible,
      select:focus-visible, [role="button"]:focus-visible, [tabindex]:focus-visible {
        outline: 2px solid #00e5ff !important; outline-offset: 2px !important;
        border-radius: 2px;
      }
      /* Skip-to-content link, visible only when focused */
      .cs-skip { position:fixed; top:-60px; left:8px; z-index:100000; background:#00e5ff; color:#000;
        padding:10px 18px; font-weight:700; letter-spacing:.1em; transition:top .15s; }
      .cs-skip:focus { top:8px; }
      /* Respect reduced-motion: stop the heavy animation for users who ask for it */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important; scroll-behavior: auto !important;
        }
      }
    `;
    document.head.appendChild(respStyle);

    // Canonical, hreflang and the Organization/WebSite/FAQ schema live in the
    // static index.html <head> — do NOT inject them again here: the runtime
    // copies drifted out of sync (conflicting canonical, ratings, founder name)
    // and duplicate/contradictory structured data hurts SEO.

    // ═══ JSON-LD STRUCTURED DATA (page-level extras only) ═══
    var jsonLd = [
      // HowTo — Come lavoriamo (not present in the static head)
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": "Come lavoriamo — Il processo Carbon Stealth",
        "description": "Il nostro processo di sviluppo in 6 fasi per garantire risultati eccellenti.",
        "totalTime": "P30D",
        "estimatedCost": { "@type": "MonetaryAmount", "currency": "EUR", "value": "800" },
        "step": [
          { "@type": "HowToStep", "position": 1, "name": "Analisi e Brief", "text": "Studiamo il tuo progetto, gli obiettivi e il target. Definiamo scope, timeline e budget.", "url": "https://carbonstealth.eu/contatti/" },
          { "@type": "HowToStep", "position": 2, "name": "Architettura e Design", "text": "Progettiamo la struttura, wireframe e design UI/UX. Prototipo interattivo per approvazione." },
          { "@type": "HowToStep", "position": 3, "name": "Sviluppo", "text": "Costruiamo con React, Node.js, PostgreSQL. Code review e test su ogni feature." },
          { "@type": "HowToStep", "position": 4, "name": "Test e QA", "text": "Test su dispositivi reali, performance audit, sicurezza. Lighthouse score 90+." },
          { "@type": "HowToStep", "position": 5, "name": "Lancio", "text": "Deploy su VPS Hetzner, configurazione DNS, SSL, CDN. SEO on-page completo." },
          { "@type": "HowToStep", "position": 6, "name": "Supporto", "text": "3 mesi di supporto gratuito. Bug fix entro 24 ore. Manutenzione e aggiornamenti." }
        ]
      }
    ];

    jsonLd.forEach(function(data) {
      var script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });

  }, []);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PROFESSIONAL HOMEPAGE — calm, corporate, trust-first.
// (Previous theatrical "vibe" version archived: git tag
//  pre-professional-redesign-v1 / branch archive/vibe-version.)
// ═══════════════════════════════════════════════════════════════
var C = "#00e5ff", CR = "0,229,255", INK = "#0a0c10", HEAD = "'Inter Tight',sans-serif";

// Professional, trilingual homepage copy.
var T = {
  nav: { it:["Servizi","Lavori","Team","Contatti"], en:["Services","Work","Team","Contact"], bg:["Услуги","Проекти","Екип","Контакти"] },
  navIds: ["services","work","team","contact"],
  quote: { it:"Richiedi un preventivo", en:"Get a quote", bg:"Заяви оферта" },
  eyebrow: { it:"Agenzia digitale · Italia & Bulgaria", en:"Digital agency · Italy & Bulgaria", bg:"Дигитална агенция · Италия и България" },
  h1: { it:"Software e siti web che fanno crescere il tuo business.", en:"Software and websites that grow your business.", bg:"Софтуер и уебсайтове, които развиват бизнеса ви." },
  sub: { it:"Carbon Stealth VCC progetta e sviluppa siti, e-commerce, software gestionale ed ERP su misura — con prestazioni reali, design pulito e supporto in italiano, inglese e bulgaro.",
         en:"Carbon Stealth VCC designs and builds websites, e-commerce, custom software and ERP systems — with real performance, clean design and support in Italian, English and Bulgarian.",
         bg:"Carbon Stealth VCC проектира и разработва сайтове, електронна търговия, софтуер по поръчка и ERP системи — с реална производителност, чист дизайн и поддръжка на италиански, английски и български." },
  ctaPrimary: { it:"Richiedi un preventivo gratuito", en:"Request a free quote", bg:"Заявете безплатна оферта" },
  ctaSecondary: { it:"Esplora i servizi", en:"Explore services", bg:"Вижте услугите" },
  stats: { it:[["50+","Progetti consegnati"],["3","Lingue di lavoro"],["24h","Tempo di risposta"],["99.9%","Uptime garantito"]],
           en:[["50+","Projects delivered"],["3","Working languages"],["24h","Response time"],["99.9%","Uptime SLA"]],
           bg:[["50+","Завършени проекта"],["3","Работни езика"],["24ч","Време за отговор"],["99.9%","Гарантиран Uptime"]] },
  techLabel: { it:"Stack tecnologico", en:"Technology stack", bg:"Технологичен стек" },
  srvTag: { it:"Servizi", en:"Services", bg:"Услуги" },
  srvTitle: { it:"Cosa facciamo", en:"What we do", bg:"Какво правим" },
  srvIntro: { it:"Soluzioni digitali complete, dallo sviluppo alla messa in produzione — tutto in-house.", en:"End-to-end digital solutions, from build to production — all in-house.", bg:"Цялостни дигитални решения, от разработка до продукция — всичко в къщи." },
  capTag: { it:"Capacità uniche", en:"Unique capabilities", bg:"Уникални възможности" },
  capTitle: { it:"Reverse Engineering & Stampa 3D", en:"Reverse Engineering & 3D Printing", bg:"Reverse Engineering и 3D печат" },
  capBody: { it:"Oltre al software, ricostruiamo in CAD parti meccaniche e dispositivi, analizziamo firmware e protocolli e stampiamo in 3D prototipi, ricambi introvabili e piccole serie. Dal pezzo fisico al file, e ritorno.",
             en:"Beyond software, we reconstruct mechanical parts and devices in CAD, analyse firmware and protocols, and 3D-print prototypes, hard-to-find spare parts and small batches. From physical part to file, and back.",
             bg:"Освен софтуер, реконструираме в CAD механични части и устройства, анализираме фърмуер и протоколи и принтираме на 3D прототипи, ненамираеми резервни части и малки серии. От физическата част до файла и обратно." },
  capPoints: { it:["Scansione e ricostruzione CAD","Analisi firmware, protocolli, embedded","Stampa 3D FDM: prototipi e ricambi"],
               en:["Scanning and CAD reconstruction","Firmware, protocol & embedded analysis","FDM 3D printing: prototypes & spares"],
               bg:["Сканиране и CAD реконструкция","Анализ на фърмуер, протоколи, embedded","FDM 3D печат: прототипи и части"] },
  workTag: { it:"Portfolio", en:"Selected work", bg:"Избрани проекти" },
  workTitle: { it:"Progetti recenti", en:"Recent projects", bg:"Последни проекти" },
  procTag: { it:"Metodo", en:"Process", bg:"Процес" },
  procTitle: { it:"Come lavoriamo", en:"How we work", bg:"Как работим" },
  proc: { it:[["01","Analisi","Studiamo obiettivi, target e budget. Preventivo dettagliato entro 24 ore."],["02","Design","Prototipo interattivo che approvi prima di scrivere codice."],["03","Sviluppo","Codice pulito (React, Node.js), test su dispositivi reali, niente template."],["04","Lancio","Deploy, SEO on-page e 3 mesi di supporto inclusi."]],
          en:[["01","Discovery","We map goals, audience and budget. Detailed quote within 24 hours."],["02","Design","An interactive prototype you sign off before any code is written."],["03","Build","Clean code (React, Node.js), tested on real devices, no templates."],["04","Launch","Deployment, on-page SEO and 3 months of support included."]],
          bg:[["01","Анализ","Дефинираме цели, аудитория и бюджет. Подробна оферта до 24 часа."],["02","Дизайн","Интерактивен прототип, който одобрявате преди код."],["03","Разработка","Чист код (React, Node.js), тестван на реални устройства, без шаблони."],["04","Пускане","Deploy, on-page SEO и 3 месеца поддръжка включени."]] },
  teamTag: { it:"Team", en:"Team", bg:"Екип" },
  teamTitle: { it:"Persone, non un call center", en:"People, not a call center", bg:"Хора, не call център" },
  teamBody: { it:"Siamo un team full-stack remote-first guidato dal fondatore Stefan Kostadinov. Ogni progetto ha un referente unico, dalla prima call alla messa in produzione.",
              en:"We are a full-stack, remote-first team led by founder Stefan Kostadinov. Every project has a single point of contact, from the first call to production.",
              bg:"Ние сме full-stack remote-first екип, воден от основателя Стефан Костадинов. Всеки проект има един отговорник — от първия разговор до продукция." },
  teamLink: { it:"Conosci il team →", en:"Meet the team →", bg:"Запознай се с екипа →" },
  ctaTitle: { it:"Parliamo del tuo progetto.", en:"Let's talk about your project.", bg:"Нека обсъдим вашия проект." },
  ctaSub: { it:"Raccontaci cosa ti serve — rispondiamo entro 24 ore lavorative con una proposta concreta.", en:"Tell us what you need — we reply within 24 business hours with a concrete proposal.", bg:"Кажете ни от какво имате нужда — отговаряме до 24 работни часа с конкретно предложение." },
  fName: { it:"Nome", en:"Name", bg:"Име" }, fEmail:{ it:"Email", en:"Email", bg:"Имейл" },
  fPhone: { it:"Telefono (opzionale)", en:"Phone (optional)", bg:"Телефон (по желание)" }, fMsg:{ it:"Il tuo progetto", en:"Your project", bg:"Вашият проект" },
  fSend: { it:"Invia richiesta", en:"Send request", bg:"Изпрати запитване" },
  fOk: { it:"Grazie! Ti risponderemo entro 24 ore.", en:"Thank you! We'll reply within 24 hours.", bg:"Благодарим! Ще отговорим до 24 часа." },
  fErr: { it:"Invio non riuscito. Riprova o scrivici a info@carbonstealth.eu", en:"Send failed. Please try again or email info@carbonstealth.eu", bg:"Неуспешно изпращане. Опитайте отново или пишете на info@carbonstealth.eu" },
  fGdpr: { it:"Inviando accetti la nostra", en:"By sending you accept our", bg:"С изпращането приемате нашата" },
  privacy: { it:"Informativa Privacy", en:"Privacy Policy", bg:"Политика за поверителност" },
  skip: { it:"Salta al contenuto", en:"Skip to content", bg:"Към съдържанието" },
  ftDesc: { it:"Agenzia digitale a Bobov Dol, Bulgaria. Sviluppo web, software, ERP, reverse engineering e stampa 3D per Italia, Bulgaria e l'UE.",
            en:"Digital agency in Bobov Dol, Bulgaria. Web, software, ERP, reverse engineering and 3D printing for Italy, Bulgaria and the EU.",
            bg:"Дигитална агенция в Бобов дол, България. Уеб, софтуер, ERP, reverse engineering и 3D печат за Италия, България и ЕС." },
};
var PROJECTS = [
  { n:"Nexus Dominion", t:{it:"Browser MMO",en:"Browser MMO",bg:"Браузър MMO"}, d:{it:"MMO browser con multiplayer in tempo reale, gilde ed economia gestita dai giocatori.",en:"Real-time multiplayer browser MMO with guilds and a player-driven economy.",bg:"Браузър MMO с мултиплейър в реално време, гилдии и икономика."}, url:"https://nexus.carbonstealth.eu", tech:"React · Node.js · PostgreSQL · Redis" },
  { n:"OU Nikola Vaptsarov", t:{it:"Sito scolastico",en:"School website",bg:"Училищен сайт"}, d:{it:"Sito ufficiale della scuola elementare di Bobov Dol, con sistema news multilingue.",en:"Official primary-school website in Bobov Dol with a multilingual news system.",bg:"Официален сайт на училището в Бобов дол с многоезична новинарска система."}, url:"https://ouvaptsarov.com", tech:"React · Vite · PHP" },
  { n:"ERP Ascensori", t:{it:"Sistema ERP",en:"ERP system",bg:"ERP система"}, d:{it:"ERP per un produttore italiano di ascensori: produzione, magazzino, fatturazione, 7 livelli di ruoli.",en:"ERP for an Italian elevator manufacturer: production, warehouse, invoicing, 7-level roles.",bg:"ERP за италиански производител на асансьори: производство, склад, фактуриране."}, url:"https://erp.carbonstealth.eu", tech:"React · Prisma · PostgreSQL" },
  { n:"CS Anti-Cheat v4.0", t:{it:"Sicurezza FiveM",en:"FiveM security",bg:"FiveM сигурност"}, d:{it:"Sistema anti-cheat per server FiveM: oltre 40 moduli di rilevamento e report firmati.",en:"Anti-cheat for FiveM servers: 40+ detection modules and signed forensic reports.",bg:"Анти-чийт за FiveM сървъри: 40+ модула за откриване и подписани отчети."}, url:"https://ac.carbonstealth.eu", tech:"Python · Flask · PostgreSQL" },
  { n:"Treti Mart", t:{it:"Marketplace",en:"Marketplace",bg:"Маркетплейс"}, d:{it:"Marketplace bulgaro per veicoli, immobili e servizi.",en:"Bulgarian marketplace for vehicles, real estate and services.",bg:"Български маркетплейс за автомобили, имоти и услуги."}, url:"https://tretimart.carbonstealth.eu", tech:"React · Node.js · Stripe" },
];
var TECHS = ["React","Next.js","Node.js","TypeScript","PostgreSQL","Docker","AWS","WordPress"];

export default function App(){
  var [lang,setLang] = useState(function(){return detectLang()});
  var [mobileMenu,setMobileMenu] = useState(false);
  var [showAdmin,setShowAdmin] = useState(false);
  var [cookieOk,setCookieOk] = useState(function(){try{return localStorage.getItem("cs_cookie")!==null}catch(e){return true}});
  var [formName,setFormName]=useState(""),[formEmail,setFormEmail]=useState(""),[formPhone,setFormPhone]=useState(""),[formMsg,setFormMsg]=useState(""),[formSent,setFormSent]=useState(false);
  function tr(o){return o[lang]||o.en}
  function chooseLang(l){setLang(l);try{localStorage.setItem("cs_lang",l)}catch(e){}}

  useEffect(function(){if(explicitLang())return;detectLangByIP(function(l){setLang(l)})},[]);
  useEffect(function(){try{if(sessionStorage.getItem("cs_admin_token"))setShowAdmin(false)}catch(e){}
    function onKey(e){if(e.ctrlKey&&e.shiftKey&&(e.key==="A"||e.key==="a")){e.preventDefault();setShowAdmin(true)}}
    window.addEventListener("keydown",onKey);return function(){window.removeEventListener("keydown",onKey)}},[]);

  function handleFormSubmit(){
    if(!formName.trim()||!formEmail.trim()||!formMsg.trim()){setFormSent("error");return}
    setFormSent("sending");
    fetch("/api/contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:formName,email:formEmail,phone:formPhone,message:formMsg,lang:lang,_gotcha:""})})
      .then(function(r){return r.json()}).then(function(d){if(d.ok){setFormSent("ok");setTimeout(function(){setFormSent(false);setFormName("");setFormEmail("");setFormPhone("");setFormMsg("")},6000)}else{setFormSent("error")}})
      .catch(function(){setFormSent("error")});
  }
  function acceptCookies(){setCookieOk(true);try{localStorage.setItem("cs_cookie","accepted")}catch(e){}}

  var srv = (SRV_DATA[lang]||SRV_DATA.en).slice(0,8);
  var inputStyle={width:"100%",background:"#fff",border:"1px solid #d7dde3",borderRadius:8,color:INK,padding:"13px 15px",fontSize:14,fontFamily:HEAD,outline:"none"};
  var sectionPad={padding:"clamp(64px,9vw,120px) clamp(20px,5vw,40px)"};
  var wrap={maxWidth:1180,margin:"0 auto"};
  var eyebrowStyle={fontSize:12,letterSpacing:".18em",textTransform:"uppercase",color:"#0090a8",fontWeight:700,marginBottom:16};
  var h2Style={fontFamily:HEAD,fontSize:"clamp(1.8rem,4vw,2.8rem)",fontWeight:800,letterSpacing:"-.02em",color:INK,lineHeight:1.1,margin:"0 0 16px"};

  return (
    <div style={{background:"#fff",color:"#3a4350",fontFamily:HEAD,fontSize:15,lineHeight:1.6,WebkitFontSmoothing:"antialiased"}}>
      <a href="#main" className="cs-skip">{tr(T.skip)}</a>
      {showAdmin && <AdminPanel onClose={function(){setShowAdmin(false)}} />}
      <SEOInjector/>
      <style>{".cs-skip{position:fixed;top:-60px;left:8px;z-index:100000;background:"+C+";color:#001014;padding:10px 18px;font-weight:700;border-radius:6px;transition:top .15s}.cs-skip:focus{top:8px}"
        +"a{color:#0090a8;text-decoration:none}::selection{background:"+C+";color:#001014}"
        +"a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,[role=button]:focus-visible{outline:2px solid "+C+";outline-offset:2px}"
        +".cs-link:hover{color:"+INK+"}.cs-card{transition:transform .2s,box-shadow .2s,border-color .2s}.cs-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(10,12,16,.10);border-color:rgba("+CR+",.5)}"
        +".cs-btn{transition:all .18s}.cs-btn-primary:hover{background:#00c4dd;box-shadow:0 10px 28px rgba("+CR+",.35)}.cs-btn-ghost:hover{background:rgba("+CR+",.08);border-color:"+C+"}"
        +".cs-navlink{transition:color .15s}.cs-navlink:hover{color:"+INK+"}"
        +"@media(max-width:820px){.cs-desk{display:none !important}.cs-burger{display:flex !important}}"
        +"@media(min-width:821px){.cs-burger{display:none !important}.cs-mob{display:none !important}}"
        +"@media(prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}"}</style>

      {/* ── HEADER ── */}
      <header style={{position:"sticky",top:0,zIndex:50,background:"rgba(255,255,255,.88)",backdropFilter:"blur(10px)",borderBottom:"1px solid #eef1f4"}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"14px clamp(20px,5vw,40px)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20}}>
          <a href={lang==="it"?"/":"/"+lang+"/"} aria-label="Carbon Stealth VCC" style={{display:"flex",alignItems:"center",gap:9,textDecoration:"none"}}>
            <span aria-hidden="true" style={{width:30,height:30,borderRadius:7,background:INK,color:C,fontFamily:HEAD,fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",letterSpacing:"-.04em"}}>CS</span>
            <span style={{fontFamily:HEAD,fontWeight:800,fontSize:17,color:INK,letterSpacing:"-.02em"}}>Carbon Stealth</span>
          </a>
          <nav className="cs-desk" aria-label="Primary" style={{display:"flex",alignItems:"center",gap:28}}>
            {T.nav[lang].map(function(label,i){return <a key={i} href={"#"+T.navIds[i]} className="cs-navlink" style={{color:"#5a6573",fontSize:14,fontWeight:600}}>{label}</a>})}
            <span style={{display:"flex",gap:6}}>{["it","en","bg"].map(function(l){return <button key={l} onClick={function(){chooseLang(l)}} aria-label={l.toUpperCase()} className="cs-btn" style={{cursor:"pointer",fontSize:11,fontWeight:700,padding:"4px 8px",borderRadius:6,border:"1px solid "+(lang===l?C:"#dfe4e9"),background:lang===l?"rgba("+CR+",.1)":"transparent",color:lang===l?"#0090a8":"#8a93a0"}}>{l.toUpperCase()}</button>})}</span>
            <a href="#contact" className="cs-btn cs-btn-primary" style={{background:C,color:"#001014",fontWeight:700,fontSize:13,padding:"10px 18px",borderRadius:8}}>{tr(T.quote)}</a>
          </nav>
          <button className="cs-burger cs-btn" onClick={function(){setMobileMenu(!mobileMenu)}} aria-label="Menu" aria-expanded={mobileMenu} style={{display:"none",cursor:"pointer",background:"none",border:"1px solid #dfe4e9",borderRadius:8,padding:"8px 12px",color:INK,fontSize:18}}>{mobileMenu?"✕":"☰"}</button>
        </div>
        {mobileMenu && <div className="cs-mob" style={{borderTop:"1px solid #eef1f4",padding:"12px clamp(20px,5vw,40px)",display:"flex",flexDirection:"column",gap:4}}>
          {T.nav[lang].map(function(label,i){return <a key={i} href={"#"+T.navIds[i]} onClick={function(){setMobileMenu(false)}} style={{padding:"12px 4px",color:"#3a4350",fontWeight:600,borderBottom:"1px solid #f3f5f7"}}>{label}</a>})}
          <div style={{display:"flex",gap:8,padding:"12px 0"}}>{["it","en","bg"].map(function(l){return <button key={l} onClick={function(){chooseLang(l);setMobileMenu(false)}} className="cs-btn" style={{cursor:"pointer",fontSize:12,fontWeight:700,padding:"6px 12px",borderRadius:6,border:"1px solid "+(lang===l?C:"#dfe4e9"),background:lang===l?"rgba("+CR+",.1)":"transparent",color:lang===l?"#0090a8":"#8a93a0"}}>{l.toUpperCase()}</button>})}</div>
          <a href="#contact" onClick={function(){setMobileMenu(false)}} className="cs-btn cs-btn-primary" style={{background:C,color:"#001014",fontWeight:700,textAlign:"center",padding:"12px",borderRadius:8,marginTop:4}}>{tr(T.quote)}</a>
        </div>}
      </header>

      <main id="main">
      {/* ── HERO ── */}
      <section style={{position:"relative",background:"linear-gradient(180deg,#0a0c10 0%,#0d1320 100%)",color:"#e8edf2",padding:"clamp(72px,11vw,140px) clamp(20px,5vw,40px) clamp(56px,8vw,96px)",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-30%",right:"-10%",width:600,height:600,background:"radial-gradient(circle,rgba("+CR+",.16),transparent 60%)",filter:"blur(40px)",pointerEvents:"none"}}/>
        <div style={{maxWidth:1180,margin:"0 auto",position:"relative"}}>
          <div style={{...eyebrowStyle,color:C}}>{tr(T.eyebrow)}</div>
          <h1 style={{fontFamily:HEAD,fontSize:"clamp(2.2rem,5.5vw,4.2rem)",fontWeight:800,letterSpacing:"-.03em",lineHeight:1.05,color:"#fff",maxWidth:920,margin:"0 0 24px"}}>{tr(T.h1)}</h1>
          <p style={{fontSize:"clamp(1rem,1.6vw,1.2rem)",color:"#aab4c0",maxWidth:680,margin:"0 0 36px",lineHeight:1.65}}>{tr(T.sub)}</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:56}}>
            <a href="#contact" className="cs-btn cs-btn-primary" style={{background:C,color:"#001014",fontWeight:700,fontSize:15,padding:"15px 30px",borderRadius:10}}>{tr(T.ctaPrimary)}</a>
            <a href="#services" className="cs-btn cs-btn-ghost" style={{color:"#e8edf2",fontWeight:700,fontSize:15,padding:"15px 30px",borderRadius:10,border:"1px solid rgba(255,255,255,.22)"}}>{tr(T.ctaSecondary)}</a>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:20,maxWidth:760,borderTop:"1px solid rgba(255,255,255,.1)",paddingTop:32}}>
            {tr(T.stats).map(function(s,i){return <div key={i}><div style={{fontFamily:HEAD,fontSize:"clamp(1.6rem,3vw,2.2rem)",fontWeight:800,color:"#fff",letterSpacing:"-.02em"}}>{s[0]}</div><div style={{fontSize:12.5,color:"#8b95a2",marginTop:2}}>{s[1]}</div></div>})}
          </div>
        </div>
      </section>

      {/* ── TECH STRIP ── */}
      <div style={{background:"#0d1320",borderTop:"1px solid rgba(255,255,255,.06)",padding:"22px clamp(20px,5vw,40px)"}}>
        <div style={{maxWidth:1180,margin:"0 auto",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"14px 28px"}}>
          <span style={{fontSize:11,letterSpacing:".16em",textTransform:"uppercase",color:"#5b6675",fontWeight:700}}>{tr(T.techLabel)}</span>
          {TECHS.map(function(t,i){return <span key={i} style={{color:"#8b95a2",fontSize:14,fontWeight:600}}>{t}</span>})}
        </div>
      </div>

      {/* ── SERVICES ── */}
      <section id="services" style={{...sectionPad,background:"#f6f8fa"}}>
        <div style={wrap}>
          <div style={eyebrowStyle}>{tr(T.srvTag)}</div>
          <h2 style={h2Style}>{tr(T.srvTitle)}</h2>
          <p style={{fontSize:16,color:"#5a6573",maxWidth:620,marginBottom:48}}>{tr(T.srvIntro)}</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:20}}>
            {srv.map(function(s,i){return <div key={i} className="cs-card" style={{background:"#fff",border:"1px solid #e7ebef",borderRadius:14,padding:"28px 26px"}}>
              <div style={{fontSize:12,fontWeight:800,color:C,letterSpacing:".05em",marginBottom:14}}>{s.n}</div>
              <h3 style={{fontFamily:HEAD,fontSize:18,fontWeight:700,color:INK,margin:"0 0 8px"}}>{s.t}</h3>
              <p style={{fontSize:14,color:"#5a6573",lineHeight:1.65,margin:"0 0 14px"}}>{s.d}</p>
              <div style={{fontSize:11,letterSpacing:".08em",color:"#9aa4b0",fontWeight:600}}>{s.tags}</div>
            </div>})}
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES (reverse engineering / 3D) ── */}
      <section style={{...sectionPad,background:INK,color:"#e8edf2"}}>
        <div style={{maxWidth:1180,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"48px",alignItems:"center"}}>
          <div>
            <div style={{...eyebrowStyle,color:C}}>{tr(T.capTag)}</div>
            <h2 style={{...h2Style,color:"#fff"}}>{tr(T.capTitle)}</h2>
            <p style={{fontSize:16,color:"#aab4c0",lineHeight:1.7,marginBottom:24}}>{tr(T.capBody)}</p>
            <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:12}}>
              {tr(T.capPoints).map(function(p,i){return <li key={i} style={{display:"flex",gap:12,alignItems:"flex-start",fontSize:15,color:"#cfd6dd"}}><span style={{color:C,fontWeight:800}}>—</span>{p}</li>})}
            </ul>
          </div>
          <div style={{border:"1px solid rgba("+CR+",.25)",borderRadius:16,background:"linear-gradient(135deg,rgba("+CR+",.06),transparent)",padding:"40px",textAlign:"center"}}>
            <div style={{fontFamily:HEAD,fontSize:"clamp(3rem,8vw,5rem)",fontWeight:800,color:"#fff",letterSpacing:"-.04em",lineHeight:1}}>CAD → STL</div>
            <div style={{fontSize:13,color:"#8b95a2",marginTop:14,letterSpacing:".1em"}}>SCAN · RECONSTRUCT · PRINT</div>
          </div>
        </div>
      </section>

      {/* ── WORK ── */}
      <section id="work" style={{...sectionPad,background:"#fff"}}>
        <div style={wrap}>
          <div style={eyebrowStyle}>{tr(T.workTag)}</div>
          <h2 style={h2Style}>{tr(T.workTitle)}</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20,marginTop:40}}>
            {PROJECTS.map(function(p,i){return <a key={i} href={p.url} target="_blank" rel="noopener" className="cs-card" style={{display:"block",background:"#fff",border:"1px solid #e7ebef",borderRadius:14,padding:"26px",color:"inherit"}}>
              <div style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase",color:C,fontWeight:700,marginBottom:10}}>{tr(p.t)}</div>
              <h3 style={{fontFamily:HEAD,fontSize:19,fontWeight:700,color:INK,margin:"0 0 8px"}}>{p.n}</h3>
              <p style={{fontSize:14,color:"#5a6573",lineHeight:1.6,margin:"0 0 16px"}}>{tr(p.d)}</p>
              <div style={{fontSize:11.5,color:"#9aa4b0",fontWeight:600,paddingTop:14,borderTop:"1px solid #eef1f4"}}>{p.tech}</div>
            </a>})}
          </div>
        </div>
      </section>

      {/* ── PROCESS ── */}
      <section style={{...sectionPad,background:"#f6f8fa"}}>
        <div style={wrap}>
          <div style={eyebrowStyle}>{tr(T.procTag)}</div>
          <h2 style={h2Style}>{tr(T.procTitle)}</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:24,marginTop:40}}>
            {tr(T.proc).map(function(p,i){return <div key={i}>
              <div style={{fontFamily:HEAD,fontSize:34,fontWeight:800,color:"rgba("+CR+",.9)",letterSpacing:"-.02em"}}>{p[0]}</div>
              <h3 style={{fontFamily:HEAD,fontSize:17,fontWeight:700,color:INK,margin:"8px 0 8px"}}>{p[1]}</h3>
              <p style={{fontSize:14,color:"#5a6573",lineHeight:1.6,margin:0}}>{p[2]}</p>
            </div>})}
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" style={{...sectionPad,background:"#fff"}}>
        <div style={{maxWidth:760,margin:"0 auto",textAlign:"center"}}>
          <div style={{...eyebrowStyle,textAlign:"center"}}>{tr(T.teamTag)}</div>
          <h2 style={{...h2Style,textAlign:"center"}}>{tr(T.teamTitle)}</h2>
          <p style={{fontSize:16,color:"#5a6573",lineHeight:1.7,marginBottom:24}}>{tr(T.teamBody)}</p>
          <a className="cs-link" href={lang==="it"?"/team/":lang==="bg"?"/bg/ekip/":"/en/team/"} style={{fontWeight:700,color:"#0090a8"}}>{tr(T.teamLink)}</a>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" style={{...sectionPad,background:"linear-gradient(180deg,#0d1320,#0a0c10)",color:"#e8edf2"}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{...eyebrowStyle,color:C}}>{tr(T.nav[lang][3])}</div>
          <h2 style={{...h2Style,color:"#fff"}}>{tr(T.ctaTitle)}</h2>
          <p style={{fontSize:16,color:"#aab4c0",marginBottom:32,lineHeight:1.65}}>{tr(T.ctaSub)}</p>
          {formSent==="ok" ? (
            <div role="status" style={{padding:"28px",border:"1px solid rgba(0,200,120,.4)",background:"rgba(0,200,120,.08)",borderRadius:12,color:"#7ee2b0",fontWeight:600}}>{tr(T.fOk)}</div>
          ) : (
            <form onSubmit={function(e){e.preventDefault();handleFormSubmit()}} style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <input value={formName} onChange={function(e){setFormName(e.target.value)}} placeholder={tr(T.fName)} aria-label={tr(T.fName)} required style={inputStyle}/>
                <input value={formEmail} onChange={function(e){setFormEmail(e.target.value)}} placeholder={tr(T.fEmail)} aria-label={tr(T.fEmail)} type="email" required style={inputStyle}/>
              </div>
              <input value={formPhone} onChange={function(e){setFormPhone(e.target.value)}} placeholder={tr(T.fPhone)} aria-label={tr(T.fPhone)} type="tel" style={inputStyle}/>
              <textarea value={formMsg} onChange={function(e){setFormMsg(e.target.value)}} placeholder={tr(T.fMsg)} aria-label={tr(T.fMsg)} required rows={5} style={{...inputStyle,resize:"vertical"}}/>
              {formSent==="error" && <div role="alert" style={{padding:"12px 15px",border:"1px solid rgba(255,90,120,.5)",background:"rgba(255,90,120,.1)",borderRadius:8,color:"#ff96aa",fontSize:13}}>{tr(T.fErr)}</div>}
              <p style={{fontSize:12,color:"#7c8694"}}>{tr(T.fGdpr)} <a href={lang==="bg"?"/bg/privacy/":lang==="en"?"/en/privacy/":"/privacy/"} style={{color:C}}>{tr(T.privacy)}</a>.</p>
              <button type="submit" disabled={formSent==="sending"} className="cs-btn cs-btn-primary" style={{background:C,color:"#001014",fontWeight:700,fontSize:15,padding:"15px",borderRadius:10,border:"none",cursor:"pointer",opacity:formSent==="sending"?.6:1}}>{formSent==="sending"?"…":tr(T.fSend)}</button>
            </form>
          )}
          <div style={{display:"flex",flexWrap:"wrap",gap:"10px 28px",marginTop:32,paddingTop:24,borderTop:"1px solid rgba(255,255,255,.1)",fontSize:14}}>
            <a href="https://wa.me/393792969699" style={{color:"#cfd6dd"}}>WhatsApp +39 379 296 9699</a>
            <a href="tel:+359877414874" style={{color:"#cfd6dd"}}>BG +359 877 414 874</a>
            <a href="mailto:info@carbonstealth.eu" style={{color:C}}>info@carbonstealth.eu</a>
          </div>
        </div>
      </section>
      </main>

      {/* ── FOOTER ── */}
      <footer style={{background:"#06080b",color:"#8b95a2",padding:"clamp(48px,7vw,80px) clamp(20px,5vw,40px) 40px"}}>
        <div style={{maxWidth:1180,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:"40px 28px"}}>
          <div style={{maxWidth:300}}>
            <img src="/logo.png" alt="Carbon Stealth VCC" width="120" height="51" style={{height:28,width:"auto",marginBottom:16}}/>
            <p style={{fontSize:13,lineHeight:1.7,color:"#6b7686"}}>{tr(T.ftDesc)}</p>
          </div>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:".1em",textTransform:"uppercase",marginBottom:14}}>{tr(T.srvTag)}</div>
            {(SRV_DATA[lang]||SRV_DATA.en).slice(0,6).map(function(s,i){var u=lang==="it"?"/servizi/sviluppo-siti-web/":lang==="bg"?"/bg/uslugi/web-razrabotka/":"/en/services/web-development/";return <a key={i} href={u} style={{display:"block",color:"#8b95a2",fontSize:13.5,padding:"5px 0"}}>{s.t}</a>})}
          </div>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:".1em",textTransform:"uppercase",marginBottom:14}}>{lang==="it"?"Azienda":lang==="bg"?"Фирма":"Company"}</div>
            {[[lang==="it"?"Chi siamo":lang==="bg"?"За нас":"About",lang==="it"?"/chi-siamo/":lang==="bg"?"/bg/za-nas/":"/en/about/"],[T.teamTag[lang]||"Team",lang==="it"?"/team/":lang==="bg"?"/bg/ekip/":"/en/team/"],[lang==="it"?"Lavora con noi":lang==="bg"?"Кариери":"Careers",lang==="it"?"/carriere/":lang==="bg"?"/bg/kariera/":"/en/careers/"],[lang==="it"?"Portfolio":lang==="bg"?"Портфолио":"Portfolio",lang==="it"?"/portfolio/":lang==="bg"?"/bg/portfolio/":"/en/portfolio/"],[lang==="it"?"Blog":"Blog",lang==="it"?"/blog/":lang==="bg"?"/bg/blog/":"/en/blog/"]].map(function(x,i){return <a key={i} href={x[1]} style={{display:"block",color:"#8b95a2",fontSize:13.5,padding:"5px 0"}}>{x[0]}</a>})}
          </div>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:".1em",textTransform:"uppercase",marginBottom:14}}>{lang==="it"?"Legale":lang==="bg"?"Правно":"Legal"}</div>
            {[[tr(T.privacy),lang==="it"?"/privacy/":lang==="bg"?"/bg/privacy/":"/en/privacy/"],["Cookie",lang==="it"?"/cookie/":lang==="bg"?"/bg/cookie/":"/en/cookie/"],[lang==="it"?"Termini":lang==="bg"?"Условия":"Terms",lang==="it"?"/termini/":lang==="bg"?"/bg/usloviya/":"/en/terms/"],[lang==="it"?"Note Legali":lang==="bg"?"Правни данни":"Legal Notice",lang==="it"?"/note-legali/":lang==="bg"?"/bg/imprint/":"/en/legal-notice/"]].map(function(x,i){return <a key={i} href={x[1]} style={{display:"block",color:"#8b95a2",fontSize:13.5,padding:"5px 0"}}>{x[0]}</a>})}
          </div>
        </div>
        <div style={{maxWidth:1180,margin:"40px auto 0",paddingTop:24,borderTop:"1px solid rgba(255,255,255,.07)",fontSize:12.5,color:"#5b6675"}}>
          &copy; 2025-2026 Carbon Stealth VCC · EIK BG208725180 · ul. Samuil 3, Bobov Dol 2670, Bulgaria
        </div>
      </footer>

      {/* ── COOKIE ── */}
      {!cookieOk && <div style={{position:"fixed",bottom:16,left:16,right:16,maxWidth:560,margin:"0 auto",zIndex:9000,background:"#0d1320",border:"1px solid rgba("+CR+",.2)",borderRadius:12,padding:"16px 18px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:12,boxShadow:"0 16px 50px rgba(0,0,0,.4)"}}>
        <p style={{fontSize:12.5,color:"#aab4c0",flex:1,minWidth:200,margin:0}}>{lang==="it"?"Usiamo cookie tecnici per il funzionamento del sito.":lang==="bg"?"Използваме технически бисквитки за работата на сайта.":"We use technical cookies to run the site."} <a href={lang==="it"?"/cookie/":lang==="bg"?"/bg/cookie/":"/en/cookie/"} style={{color:C}}>{lang==="it"?"Dettagli":lang==="bg"?"Детайли":"Details"}</a></p>
        <button onClick={acceptCookies} className="cs-btn cs-btn-primary" style={{background:C,color:"#001014",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer"}}>OK</button>
      </div>}
    </div>
  );
}
