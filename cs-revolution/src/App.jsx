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
        React.createElement("div",{style:{width:420,padding:48,border:"1px solid rgba("+CR+",.12)",background:"rgba(0,0,0,.95)",position:"relative",overflow:"hidden"}},
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
    React.createElement("div",{style:{position:"fixed",inset:0,background:"#060608",zIndex:100000,overflow:"auto",fontFamily:"'Space Mono',monospace",color:"#f5f5f0",fontSize:Math.round(12*F)}},
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
    var cursorStyle = document.createElement("style");
    cursorStyle.textContent = "*, *::before, *::after { cursor: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI0IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMCwyMjksMjU1LDAuNykiIHN0cm9rZS13aWR0aD0iMS41Ii8+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMSIgZmlsbD0icmdiYSgwLDIyOSwyNTUsMC45KSIvPjwvc3ZnPg==) 10 10, auto !important; } a, button, [onclick], select, input, textarea { cursor: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI2IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMCwyMjksMjU1LDAuOCkiIHN0cm9rZS13aWR0aD0iMS41Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMiIgZmlsbD0icmdiYSgwLDIyOSwyNTUsMSkiLz48L3N2Zz4=) 12 12, pointer !important; }";
    document.head.appendChild(cursorStyle);


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
// INTERACTIVE CONSTELLATION — Nodes that connect to cursor
// ═══════════════════════════════════════════════════════════════
function Constellation() {
  var ref = useRef(null);
  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d");
    var mouse = { x: -999, y: -999 };
    var nodes = [];
    var NODE_COUNT = 40;

    function resize() {
      c.width = c.parentElement.clientWidth;
      c.height = c.parentElement.clientHeight;
      nodes = [];
      for (var i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * c.width,
          y: Math.random() * c.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: Math.random() * 2 + 1,
        });
      }
    }
    resize();
    window.addEventListener("resize", resize);
    c.parentElement.addEventListener("mousemove", function(e) {
      var rect = c.parentElement.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    c.parentElement.addEventListener("mouseleave", function() { mouse.x = -999; mouse.y = -999; });

    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > c.width) n.vx *= -1;
        if (n.y < 0 || n.y > c.height) n.vy *= -1;

        // Draw node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + CR + ",0.4)";
        ctx.fill();

        // Connect to mouse
        var dmx = n.x - mouse.x, dmy = n.y - mouse.y;
        var distM = Math.sqrt(dmx * dmx + dmy * dmy);
        if (distM < 180) {
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = "rgba(" + CR + "," + ((1 - distM / 180) * 0.25) + ")";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Connect to nearby nodes
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = "rgba(" + CR + "," + ((1 - dist / 100) * 0.08) + ")";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
    return function() { window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }} />;
}

const C = "#00e5ff";
const CR = "0,229,255";

// ══════════ SYNTH ══════════
// Audio removed

// speak removed

// ══════════ SCRAMBLE ══════════
function useScramble(text,active){const[d,setD]=useState(text);useEffect(function(){if(!active){setD(text);return}let iter=0;const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&<>{}|";const iv=setInterval(function(){setD(text.split("").map(function(ch,i){return i<iter?text[i]:ch===" "?" ":chars[Math.floor(Math.random()*chars.length)]}).join(""));iter+=.7;if(iter>=text.length)clearInterval(iv)},22);return function(){clearInterval(iv)}},[active,text]);return d}
function Scr(p){const[h,setH]=useState(false);const d=useScramble(p.text,h);return <span style={p.style} onMouseEnter={function(){setH(true)}} onMouseLeave={function(){setH(false)}}>{d}</span>}

// ═══════════════════════════════════════════════════
// 1. MAGNETIC TEXT REPULSION — Letters push AWAY from cursor
// ═══════════════════════════════════════════════════
function MagneticRepel(props) {
  var ref = useRef(null);
  var text = props.text || "";
  var chars = text.split("");

  useEffect(function() {
    function handleMouse(e) {
      if (!ref.current) return;
      var spans = ref.current.querySelectorAll(".mag-char");
      for (var i = 0; i < spans.length; i++) {
        var rect = spans[i].getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = cx - e.clientX;
        var dy = cy - e.clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var maxDist = 150;
        if (dist < maxDist) {
          var force = (1 - dist / maxDist) * 25;
          var angle = Math.atan2(dy, dx);
          spans[i].style.transform = "translate(" + (Math.cos(angle) * force) + "px," + (Math.sin(angle) * force) + "px)";
          spans[i].style.opacity = 0.4 + (dist / maxDist) * 0.6;
        } else {
          spans[i].style.transform = "translate(0,0)";
          spans[i].style.opacity = 1;
        }
      }
    }
    window.addEventListener("mousemove", handleMouse);
    return function() { window.removeEventListener("mousemove", handleMouse); };
  }, [text]);

  return (
    <div ref={ref} style={props.style}>
      {chars.map(function(ch, i) {
        return <span key={i} className="mag-char" style={{
          display: "inline-block",
          color: "inherit",
          transition: "transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          willChange: "transform",
          textShadow: "0 1px 10px rgba(0,0,0,0.6)",
        }}>{ch === " " ? "\u00a0" : ch}</span>;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 2. GLITCH FLASH — Full-screen tear on every click
// ═══════════════════════════════════════════════════
function GlitchFlash() {
  var [active, setActive] = useState(false);
  var [glitchY, setGlitchY] = useState(50);

  useEffect(function() {
    function handleClick() {
      setGlitchY(Math.random() * 80 + 10);
      setActive(true);
      setTimeout(function() { setActive(false); }, 150);
    }
    document.addEventListener("click", handleClick);
    return function() { document.removeEventListener("click", handleClick); };
  }, []);

  if (!active) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99997, pointerEvents: "none" }}>
      {/* Horizontal tear */}
      <div style={{ position: "absolute", top: glitchY + "%", left: 0, width: "100%", height: "3px", background: C, opacity: 0.6 }} />
      {/* Shifted block */}
      <div style={{ position: "absolute", top: glitchY + "%", left: 0, width: "100%", height: Math.random() * 30 + 10 + "px", background: "rgba(" + CR + ",0.03)", transform: "translateX(" + (Math.random() * 40 - 20) + "px)" }} />
      {/* RGB split flash */}
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 4px 0 0 rgba(" + CR + ",0.1), inset -4px 0 0 rgba(255,0,200,0.08)" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 3. MOUSE VELOCITY METER — Shows cursor speed visually
// ═══════════════════════════════════════════════════
function VelocityMeter() {
  var [vel, setVel] = useState(0);
  var prev = useRef({ x: 0, y: 0, t: 0 });

  useEffect(function() {
    function handleMouse(e) {
      var now = Date.now();
      var dt = now - prev.current.t;
      if (dt > 0) {
        var dx = e.clientX - prev.current.x;
        var dy = e.clientY - prev.current.y;
        var speed = Math.sqrt(dx * dx + dy * dy) / dt * 16;
        setVel(function(v) { return v + (Math.min(speed, 100) - v) * 0.15; });
      }
      prev.current = { x: e.clientX, y: e.clientY, t: now };
    }
    document.addEventListener("mousemove", handleMouse);
    return function() { document.removeEventListener("mousemove", handleMouse); };
  }, []);

  var barWidth = Math.min(vel, 100);
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 10001, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 8, color: "#ddd", letterSpacing: ".2em" }}>VEL</span>
      <div style={{ width: 60, height: 3, background: "#111" }}>
        <div style={{ width: barWidth + "%", height: "100%", background: barWidth > 70 ? "#ff3366" : C, transition: "width 0.1s, background 0.3s" }} />
      </div>
      <span style={{ fontSize: 8, color: barWidth > 70 ? "#ff3366" : "#ddd", fontFamily: "inherit", width: 28, textAlign: "right" }}>{Math.round(vel)}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 4. ASCII SCULPTURE — Generative ASCII art section
// ═══════════════════════════════════════════════════
function ASCIISculpture() {
  var [art, setArt] = useState("");
  var ref = useRef(null);

  useEffect(function() {
    var chars = " .:-=+*#%@";
    var w = 70;
    var h = 20;
    var frame = 0;

    function generate() {
      var lines = [];
      frame += 0.02;
      for (var y = 0; y < h; y++) {
        var line = "";
        for (var x = 0; x < w; x++) {
          var nx = (x / w - 0.5) * 4;
          var ny = (y / h - 0.5) * 4;
          var d = Math.sqrt(nx * nx + ny * ny);
          var val = Math.sin(d * 3 - frame * 2) * Math.cos(nx * 2 + frame) * Math.sin(ny * 2 - frame * 0.7);
          val = (val + 1) / 2;
          var idx = Math.floor(val * (chars.length - 1));
          line += chars[Math.max(0, Math.min(chars.length - 1, idx))];
        }
        lines.push(line);
      }
      setArt(lines.join("\n"));
      requestAnimationFrame(generate);
    }
    generate();
  }, []);

  return (
    <pre ref={ref} style={{
      fontFamily: "'Space Mono', monospace", fontSize: "8px", lineHeight: "10px",
      color: "rgba(" + CR + ",0.12)", textAlign: "center", overflow: "hidden",
      userSelect: "none", letterSpacing: "2px",
    }}>{art}</pre>
  );
}

// ═══════════════════════════════════════════════════
// 5. ECHO TEXT — Text that leaves ghost trails
// ═══════════════════════════════════════════════════
function EchoText(props) {
  var layers = 5;
  var items = [];
  for (var i = layers; i >= 0; i--) {
    items.push(
      <div key={i} style={{
        position: i === 0 ? "relative" : "absolute",
        top: i * -3 + "px",
        left: i * 2 + "px",
        opacity: i === 0 ? 1 : 0.04 * (layers - i),
        color: i === 0 ? (props.color || "#f5f5f0") : C,
        fontFamily: props.fontFamily || "Inter Tight, sans-serif",
        fontWeight: props.fontWeight || 900,
        fontSize: props.fontSize || "clamp(2rem,5vw,4rem)",
        lineHeight: props.lineHeight || 0.95,
        letterSpacing: props.letterSpacing || "-.04em",
        textTransform: "uppercase",
        pointerEvents: i === 0 ? "auto" : "none",
      }}>{props.children}</div>
    );
  }
  return <div style={{ position: "relative" }}>{items}</div>;
}

// ═══════════════════════════════════════════════════
// 6. SCROLL SPEED INDICATOR — Vertical bar showing scroll velocity
// ═══════════════════════════════════════════════════
function ScrollSpeed() {
  var [speed, setSpeed] = useState(0);
  var lastY = useRef(0);

  useEffect(function() {
    function handle() {
      var delta = Math.abs(window.scrollY - lastY.current);
      lastY.current = window.scrollY;
      setSpeed(function(s) { return s + (Math.min(delta, 100) - s) * 0.2; });
    }
    window.addEventListener("scroll", handle, { passive: true });
    var iv = setInterval(function() { setSpeed(function(s) { return s * 0.9; }); }, 100);
    return function() { window.removeEventListener("scroll", handle); clearInterval(iv); };
  }, []);

  return (
    <div style={{ position: "fixed", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10001, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 7, color: "#ccc", letterSpacing: ".15em", writingMode: "vertical-rl" }}>SCROLL</span>
      <div style={{ width: 2, height: 60, background: "#111", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: Math.min(speed, 100) + "%", background: speed > 60 ? "#ff3366" : C, transition: "height 0.15s" }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 7. LIVE WAVEFORM — Audio-reactive visualization from mic
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// SHOCKWAVE — Expanding rings on click anywhere on hero
// Each click sends out a visible ripple that fades
// ═══════════════════════════════════════════════════
function Shockwave() {
  var ref = useRef(null);
  var waves = useRef([]);

  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d");

    function resize() { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; }
    resize(); window.addEventListener("resize", resize);

    c.parentElement.addEventListener("click", function(e) {
      var rect = c.parentElement.getBoundingClientRect();
      waves.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        radius: 0,
        maxRadius: Math.max(c.width, c.height) * 0.8,
        opacity: 0.6,
        speed: 8 + Math.random() * 4,
        width: 2 + Math.random() * 2,
      });
      // Also add secondary smaller wave
      setTimeout(function() {
        waves.current.push({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          radius: 0,
          maxRadius: Math.max(c.width, c.height) * 0.5,
          opacity: 0.3,
          speed: 5 + Math.random() * 3,
          width: 1,
        });
      }, 100);
    });

    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (var i = waves.current.length - 1; i >= 0; i--) {
        var w = waves.current[i];
        w.radius += w.speed;
        w.opacity *= 0.985;

        if (w.opacity < 0.01 || w.radius > w.maxRadius) {
          waves.current.splice(i, 1);
          continue;
        }

        // Main ring
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + CR + "," + w.opacity + ")";
        ctx.lineWidth = w.width;
        ctx.stroke();

        // Inner glow ring
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius * 0.97, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + CR + "," + (w.opacity * 0.3) + ")";
        ctx.lineWidth = w.width * 3;
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    }
    draw();
    return function() { window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }} />;
}

// ═══════════════════════════════════════════════════
// CURSOR LIGHT TRAIL — Glowing orb that paints light
// Leaves a fading phosphor trail like a CRT
// ═══════════════════════════════════════════════════
function CursorLight() {
  var ref = useRef(null);
  var mouse = useRef({ x: -100, y: -100 });
  var trail = useRef([]);

  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d");

    function resize() { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; }
    resize(); window.addEventListener("resize", resize);

    c.parentElement.addEventListener("mousemove", function(e) {
      var rect = c.parentElement.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
      trail.current.push({ x: mouse.current.x, y: mouse.current.y, life: 1 });
      if (trail.current.length > 100) trail.current.shift();
    });

    function draw() {
      // Fade previous frame instead of clearing — creates phosphor persistence
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      ctx.fillRect(0, 0, c.width, c.height);

      // Draw trail with glow
      for (var i = 0; i < trail.current.length; i++) {
        var p = trail.current[i];
        p.life *= 0.97;
        if (p.life < 0.01) continue;

        var radius = 30 * p.life;
        var gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, "rgba(" + CR + "," + (p.life * 0.15) + ")");
        gradient.addColorStop(0.5, "rgba(" + CR + "," + (p.life * 0.05) + ")");
        gradient.addColorStop(1, "rgba(" + CR + ",0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
      }

      // Main cursor orb — bright center
      var mx = mouse.current.x, my = mouse.current.y;
      if (mx > 0 && my > 0) {
        var g = ctx.createRadialGradient(mx, my, 0, mx, my, 60);
        g.addColorStop(0, "rgba(" + CR + ",0.12)");
        g.addColorStop(0.3, "rgba(" + CR + ",0.04)");
        g.addColorStop(1, "rgba(" + CR + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(mx - 60, my - 60, 120, 120);
      }

      requestAnimationFrame(draw);
    }
    draw();
    return function() { window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} style={{ position: "absolute", inset: 0, zIndex: 7, pointerEvents: "none" }} />;
}

// ═══════════════════════════════════════════════════
// SVG LIQUID FILTER — Applied to hero for glass distortion
// Animated feTurbulence creates living liquid effect
// ═══════════════════════════════════════════════════
function LiquidFilter() {
  var turbRef = useRef(null);

  useEffect(function() {
    var t = 0;
    function animate() {
      t += 0.003;
      if (turbRef.current) {
        turbRef.current.setAttribute("baseFrequency", (0.01 + Math.sin(t) * 0.005) + " " + (0.012 + Math.cos(t * 0.7) * 0.004));
      }
      requestAnimationFrame(animate);
    }
    animate();
  }, []);

  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter id="liquid-distort" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.01 0.012" numOctaves="3" seed="42" result="turb" />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

// ═══════════════════════════════════════════════════
// CODE RAIN — Matrix-style falling characters
// ═══════════════════════════════════════════════════
function CodeRain(){var ref=useRef(null);useEffect(function(){var c=ref.current;if(!c)return;var ctx=c.getContext("2d");var chars="01\u30A2\u30A4\u30A6{}[]<>CS|@#";var fs=10;var cols,drops;
function resize(){c.width=innerWidth;c.height=innerHeight;cols=Math.floor(c.width/fs);drops=Array(cols).fill(1)}resize();window.addEventListener("resize",resize);
function draw(){ctx.fillStyle="rgba(0,0,0,0.05)";ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle="rgba(0,229,255,0.07)";ctx.font=fs+"px monospace";
for(var i=0;i<drops.length;i++){ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*fs,drops[i]*fs);if(drops[i]*fs>c.height&&Math.random()>.98)drops[i]=0;drops[i]++}requestAnimationFrame(draw)}draw();
return function(){window.removeEventListener("resize",resize)};},[]);
return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",opacity:.5}}/>;}

// ═══════════════════════════════════════════════════
// GENERATIVE CANVAS — Permanent mouse painting
// Your cursor leaves permanent generative marks
// ═══════════════════════════════════════════════════
function GenerativeCanvas() {
  const ref = useRef(null);
  useEffect(function() {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    var prev = { x: 0, y: 0 };
    function resize() { c.width = window.innerWidth; c.height = Math.max(document.body.scrollHeight, window.innerHeight * 5, 5000); }
    resize();
    // Don't clear - marks stay permanently
    document.addEventListener("mousemove", function(e) {
      var x = e.pageX; var y = e.pageY;
      var dx = x - prev.x; var dy = y - prev.y;
      var speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 2) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(" + CR + "," + Math.min(speed * 0.003, 0.08) + ")";
        ctx.lineWidth = Math.min(speed * 0.15, 4);
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        // Emit particles at high speed
        if (speed > 30) {
          for (var i = 0; i < 3; i++) {
            ctx.fillStyle = "rgba(" + CR + "," + (Math.random() * 0.12) + ")";
            ctx.fillRect(x + (Math.random() - 0.5) * speed, y + (Math.random() - 0.5) * speed, Math.random() * 3 + 1, Math.random() * 3 + 1);
          }
        }
      }
      prev = { x: x, y: y };
    });
    window.addEventListener("resize", function() { /* preserve content on resize */ });
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", top: 0, left: 0, width: "100%", pointerEvents: "none", zIndex: 2 }} />;
}

// ═══════════════════════════════════════════════════
// VARIABLE WEIGHT TEXT — Font weight changes by mouse proximity
// ═══════════════════════════════════════════════════
function ProximityText(props) {
  const ref = useRef(null);
  const [weights, setWeights] = useState([]);
  var text = props.text || "";
  var words = text.split(" ");

  useEffect(function() {
    setWeights(words.map(function() { return 700; }));
    function handleMouse(e) {
      if (!ref.current) return;
      var spans = ref.current.querySelectorAll(".prox-word");
      var newW = [];
      for (var i = 0; i < spans.length; i++) {
        var rect = spans[i].getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dist = Math.sqrt(Math.pow(e.clientX - cx, 2) + Math.pow(e.clientY - cy, 2));
        var w = Math.max(400, Math.min(900, 900 - dist * 1.5));
        newW.push(Math.round(w / 100) * 100);
      }
      setWeights(newW);
    }
    window.addEventListener("mousemove", handleMouse);
    return function() { window.removeEventListener("mousemove", handleMouse); };
  }, [text]);

  return (
    <div ref={ref} style={props.style}>
      {words.map(function(w, i) {
        return <span key={i} className="prox-word" style={{
          fontWeight: weights[i] || 700,
          color: "#f5f5f0",
          transition: "font-weight 0.15s",
          display: "inline-block",
          marginRight: "0.2em",
          textShadow: "0 2px 20px rgba(0,0,0,0.8)",
        }}>{w}</span>;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SCROLL DECODE TEXT — Characters resolve as you scroll
// ═══════════════════════════════════════════════════
function ScrollDecode(props) {
  var text = props.text || "";
  var ref = useRef(null);
  var [resolved, setResolved] = useState(0);
  var chars = "!@#$%^&*<>{}[]|/\\01";

  useEffect(function() {
    function handleScroll() {
      if (!ref.current) return;
      var rect = ref.current.getBoundingClientRect();
      var vh = window.innerHeight;
      var progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)));
      setResolved(Math.floor(progress * text.length * 1.3));
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return function() { window.removeEventListener("scroll", handleScroll); };
  }, [text]);

  var display = text.split("").map(function(ch, i) {
    if (i < resolved) return ch;
    if (ch === " ") return " ";
    return chars[Math.floor(Math.random() * chars.length)];
  }).join("");

  return <div ref={ref} style={props.style}>{display}</div>;
}

// ═══════════════════════════════════════════════════
// THREE.JS MEGA SCENE — 8000 particles forming "CARBON STEALTH"
// that scatter from mouse + nebula + wireframes + beams
// ═══════════════════════════════════════════════════
function Scene3D(){
  var ref=useRef(null);var mouse=useRef({x:0,y:0,px:0,py:0});
  useEffect(function(){
    if(!ref.current)return;
    var cleanup=null;
    var mounted=true;
    // Lazy load Three.js only when Scene3D mounts — saves 465KB from initial bundle
    import("three").then(function(mod){
      if(!mounted||!ref.current)return;
      var THREE=mod;
      var el=ref.current;
      var scene=new THREE.Scene();
      var cam=new THREE.PerspectiveCamera(50,el.clientWidth/el.clientHeight,.1,100);
      cam.position.z=6;
      var renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
      renderer.setSize(el.clientWidth,el.clientHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      renderer.setClearColor(0,0);
      el.appendChild(renderer.domElement);

    // ── STEP 1: Sample "CARBON STEALTH" text from a canvas to get particle positions ──
    var textCanvas=document.createElement("canvas");
    textCanvas.width=400;textCanvas.height=120;
    var tCtx=textCanvas.getContext("2d");
    tCtx.fillStyle="#fff";
    tCtx.font="bold 100px 'Inter Tight', 'Arial Black', sans-serif";
    tCtx.textAlign="center";
    tCtx.textBaseline="middle";
    tCtx.fillText("CS",200,60);
    var imgData=tCtx.getImageData(0,0,400,120).data;

    // Extract positions where text pixels exist
    var textPositions=[];
    for(var y=0;y<120;y+=2){
      for(var x=0;x<400;x+=2){
        var idx=(y*400+x)*4;
        if(imgData[idx]>128){
          textPositions.push({
            x:(x-200)/40,
            y:(60-y)/40,
            z:0
          });
        }
      }
    }

    // ── STEP 2: Create 8000 particles ──
    var PCOUNT=Math.min(textPositions.length,8000);
    var pGeo=new THREE.BufferGeometry();
    var positions=new Float32Array(PCOUNT*3);
    var targets=new Float32Array(PCOUNT*3);
    var randoms=new Float32Array(PCOUNT*3); // scattered positions
    var sizes=new Float32Array(PCOUNT);
    var colors=new Float32Array(PCOUNT*3);

    for(var i=0;i<PCOUNT;i++){
      var tp=textPositions[i%textPositions.length];
      // Target = text shape
      targets[i*3]=tp.x;
      targets[i*3+1]=tp.y;
      targets[i*3+2]=tp.z+(Math.random()-.5)*.3;
      // Start scattered
      var theta=Math.random()*Math.PI*2;
      var phi=Math.acos(2*Math.random()-1);
      var rad=3+Math.random()*5;
      randoms[i*3]=rad*Math.sin(phi)*Math.cos(theta);
      randoms[i*3+1]=rad*Math.sin(phi)*Math.sin(theta);
      randoms[i*3+2]=rad*Math.cos(phi);
      // Current = scattered
      positions[i*3]=randoms[i*3];
      positions[i*3+1]=randoms[i*3+1];
      positions[i*3+2]=randoms[i*3+2];
      // Size
      sizes[i]=Math.random()*2+.5;
      // Color — cyan with variation
      colors[i*3]=0+Math.random()*.1;
      colors[i*3+1]=0.8+Math.random()*.2;
      colors[i*3+2]=0.9+Math.random()*.1;
    }
    pGeo.setAttribute("position",new THREE.BufferAttribute(positions,3));
    pGeo.setAttribute("size",new THREE.BufferAttribute(sizes,1));
    pGeo.setAttribute("color",new THREE.BufferAttribute(colors,3));

    // Custom shader material for particles
    var pMat=new THREE.ShaderMaterial({
      transparent:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      vertexShader:[
        "attribute float size;",
        "attribute vec3 color;",
        "varying vec3 vColor;",
        "varying float vDist;",
        "void main(){",
        "  vColor=color;",
        "  vec4 mv=modelViewMatrix*vec4(position,1.0);",
        "  vDist=-mv.z;",
        "  gl_PointSize=size*(200.0/-mv.z);",
        "  gl_Position=projectionMatrix*mv;",
        "}"
      ].join("\n"),
      fragmentShader:[
        "varying vec3 vColor;",
        "varying float vDist;",
        "void main(){",
        "  float d=length(gl_PointCoord-vec2(0.5));",
        "  if(d>0.5)discard;",
        "  float alpha=1.0-d*2.0;",
        "  alpha*=alpha;",
        "  alpha*=clamp(1.0-vDist*0.08,0.1,1.0);",
        "  gl_FragColor=vec4(vColor,alpha*0.8);",
        "}"
      ].join("\n")
    });
    var particles=new THREE.Points(pGeo,pMat);
    scene.add(particles);

    // ── STEP 3: Wireframe geometries ──
    var wMat=new THREE.MeshBasicMaterial({color:0x00e5ff,wireframe:true,transparent:true,opacity:.06});
    var wMat2=new THREE.MeshBasicMaterial({color:0xf5f5f0,wireframe:true,transparent:true,opacity:.025});
    var ico=new THREE.Mesh(new THREE.IcosahedronGeometry(3.5,1),wMat);
    var torus1=new THREE.Mesh(new THREE.TorusGeometry(4,.01,4,120),wMat2);
    var torus2=new THREE.Mesh(new THREE.TorusGeometry(4.5,.008,4,150),wMat2);
    torus1.rotation.x=Math.PI/3;torus2.rotation.x=-Math.PI/4;torus2.rotation.z=Math.PI/5;
    scene.add(ico,torus1,torus2);

    // ── STEP 4: Energy beam lines ──
    var beamCount=12;
    for(var b=0;b<beamCount;b++){
      var bGeo=new THREE.BufferGeometry();
      var bPoints=[];
      var angle=(b/beamCount)*Math.PI*2;
      bPoints.push(new THREE.Vector3(0,0,0));
      bPoints.push(new THREE.Vector3(Math.cos(angle)*8,Math.sin(angle)*8,(Math.random()-.5)*4));
      bGeo.setFromPoints(bPoints);
      var beam=new THREE.Line(bGeo,new THREE.LineBasicMaterial({color:0x00e5ff,transparent:true,opacity:.03}));
      scene.add(beam);
    }

    // ── STEP 5: Background star field ──
    var starGeo=new THREE.BufferGeometry();
    var starPos=new Float32Array(2000*3);
    for(var i=0;i<2000*3;i++)starPos[i]=(Math.random()-.5)*40;
    starGeo.setAttribute("position",new THREE.BufferAttribute(starPos,3));
    scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:.02,transparent:true,opacity:.15})));

    // ── Mouse tracking ──
    el.addEventListener("mousemove",function(e){
      var b=el.getBoundingClientRect();
      mouse.current.x=((e.clientX-b.left)/b.width)*2-1;
      mouse.current.y=-((e.clientY-b.top)/b.height)*2+1;
    });

    // ── Animation state ──
    var formProgress=0; // 0=scattered, 1=formed
    var t=0;

    var rafId;
    function loop(){
      if(!mounted)return;            // stop after unmount — don't render a disposed context
      if(document.hidden){rafId=requestAnimationFrame(loop);return;} // pause work in background tabs
      t+=.005;

      // Gradually form text (over 3 seconds after load)
      formProgress=Math.min(1,formProgress+.008);
      var ease=formProgress*formProgress*(3-2*formProgress); // smoothstep

      // Mouse world position
      var mx=mouse.current.x*5;
      var my=mouse.current.y*3;

      // Update particles
      var pos=pGeo.attributes.position.array;
      for(var i=0;i<PCOUNT;i++){
        var tx=targets[i*3];
        var ty=targets[i*3+1];
        var tz=targets[i*3+2];
        var rx=randoms[i*3];
        var ry=randoms[i*3+1];
        var rz=randoms[i*3+2];

        // Lerp between scattered and formed
        var goalX=rx+(tx-rx)*ease;
        var goalY=ry+(ty-ry)*ease;
        var goalZ=rz+(tz-rz)*ease;

        // Mouse repulsion
        var dx=goalX-mx;
        var dy=goalY-my;
        var dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<2){
          var force=(1-dist/2)*1.5;
          var angle=Math.atan2(dy,dx);
          goalX+=Math.cos(angle)*force;
          goalY+=Math.sin(angle)*force;
          goalZ+=(Math.random()-.5)*force*.5;
        }

        // Add subtle floating noise
        goalX+=Math.sin(t*2+i*.01)*.02;
        goalY+=Math.cos(t*1.5+i*.013)*.02;
        goalZ+=Math.sin(t*1.8+i*.017)*.02;

        // Smooth follow
        pos[i*3]+=(goalX-pos[i*3])*.08;
        pos[i*3+1]+=(goalY-pos[i*3+1])*.08;
        pos[i*3+2]+=(goalZ-pos[i*3+2])*.08;
      }
      pGeo.attributes.position.needsUpdate=true;

      // Rotate wireframes slowly
      ico.rotation.y=t*.15;ico.rotation.x=t*.1;
      torus1.rotation.z=t*.08;torus2.rotation.y=t*.06;

      // Camera subtle sway
      cam.position.x=Math.sin(t*.3)*.15;
      cam.position.y=Math.cos(t*.25)*.1;
      cam.lookAt(0,0,0);

      renderer.render(scene,cam);
      rafId=requestAnimationFrame(loop);
    }
    loop();

    function onR(){cam.aspect=el.clientWidth/el.clientHeight;cam.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight)}
    window.addEventListener("resize",onR);
    cleanup=function(){cancelAnimationFrame(rafId);window.removeEventListener("resize",onR);if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);renderer.dispose()};
    });
    return function(){mounted=false;if(cleanup)cleanup()};
  },[]);
  return <div ref={ref} style={{position:"absolute",inset:0,zIndex:1}}/>;
}

// ═══════════════════════════════════════════════════
// CIRCUIT SWEEP — post-boot reveal: PCB traces grow out from the
// center of the screen, then fade. One-shot overlay.
// ═══════════════════════════════════════════════════
function CircuitSweep(){
  var ref=useRef(null);
  useEffect(function(){
    var c=ref.current;if(!c)return;
    var ctx=c.getContext("2d");
    var W=c.width=window.innerWidth,H=c.height=window.innerHeight;
    var traces=[];
    for(var i=0;i<28;i++){
      var a=Math.floor(Math.random()*4)*(Math.PI/2);
      traces.push({x:W/2,y:H/2,dir:a,len:0,max:160+Math.random()*Math.max(W,H)*.45,seg:[],turns:0});
    }
    var t0=performance.now(),raf;
    function step(now){
      var el=now-t0;
      ctx.clearRect(0,0,W,H);
      ctx.globalAlpha=el>1600?Math.max(0,1-(el-1600)/600):1;
      traces.forEach(function(tr){
        if(tr.len<tr.max){
          tr.seg.push({x:tr.x,y:tr.y});
          tr.x+=Math.cos(tr.dir)*14;tr.y+=Math.sin(tr.dir)*14;tr.len+=14;
          if(Math.random()<.12&&tr.turns<5){tr.dir+=(Math.random()<.5?1:-1)*Math.PI/2;tr.turns++}
        }
        if(!tr.seg.length)return;
        ctx.beginPath();ctx.moveTo(tr.seg[0].x,tr.seg[0].y);
        tr.seg.forEach(function(p){ctx.lineTo(p.x,p.y)});
        ctx.lineTo(tr.x,tr.y);
        ctx.strokeStyle="rgba(0,229,255,.45)";ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle="rgba(0,229,255,.95)";ctx.fillRect(tr.x-1.5,tr.y-1.5,3,3);
      });
      ctx.globalAlpha=1;
      if(el<2200)raf=requestAnimationFrame(step);
      else{ctx.clearRect(0,0,W,H);c.style.display="none"}
    }
    raf=requestAnimationFrame(step);
    return function(){cancelAnimationFrame(raf)};
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:9999,pointerEvents:"none"}}/>;
}

// ═══════════════════════════════════════════════════
// PRINT FORGE — Reverse Engineering / 3D printing visual.
// A part materializes layer by layer under a moving print head,
// then a scan beam sweeps it back to a wireframe (reverse
// engineering) and the cycle restarts.
// ═══════════════════════════════════════════════════
function PrintForge(){
  var ref=useRef(null);
  useEffect(function(){
    var c=ref.current;if(!c)return;
    var ctx=c.getContext("2d");
    var W,H;function fit(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight}
    fit();window.addEventListener("resize",fit);
    // Part silhouette: half-widths per layer, bottom -> top (a turbine-hub-like profile)
    var prof=[];
    var NL=34;
    for(var i=0;i<NL;i++){
      var t=i/(NL-1);
      var w=.42-.16*Math.sin(t*Math.PI)-(t>.75?(t-.75)*.7:0)+(i%6===0?.05:0);
      prof.push(Math.max(.08,w));
    }
    var layer=0,sub=0,phase=0,scanY=0; // phase 0=print 1=hold 2=scan(wireframe) 3=reset-fade
    var raf;
    function draw(){
      ctx.clearRect(0,0,W,H);
      var cx=W/2,baseY=H*.88,lh=(H*.72)/NL;
      // build plate
      ctx.strokeStyle="rgba(245,245,240,.15)";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(W*.08,baseY+6);ctx.lineTo(W*.92,baseY+6);ctx.stroke();
      for(var g=0;g<12;g++){ctx.beginPath();ctx.moveTo(W*.08+g*(W*.84/11),baseY+6);ctx.lineTo(W*.08+g*(W*.84/11)+8,baseY+12);ctx.strokeStyle="rgba(245,245,240,.06)";ctx.stroke()}
      var visible=phase===0?layer:NL;
      for(var i=0;i<visible;i++){
        var hw=prof[i]*W*.5,y=baseY-i*lh;
        var wire=phase===2&&y>scanY||phase===3;
        if(wire){
          ctx.strokeStyle="rgba(0,229,255,.55)";ctx.lineWidth=1;
          ctx.strokeRect(cx-hw,y-lh+1,hw*2,lh-2);
        }else{
          ctx.fillStyle="rgba(0,229,255,"+(0.10+0.10*(i/NL))+")";
          ctx.fillRect(cx-hw,y-lh+1,hw*2,lh-2);
          ctx.strokeStyle="rgba(0,229,255,.35)";ctx.lineWidth=.5;
          ctx.strokeRect(cx-hw,y-lh+1,hw*2,lh-2);
        }
      }
      if(phase===0&&layer<NL){
        // print head sweeping the current layer
        var hw2=prof[layer]*W*.5,y2=baseY-layer*lh;
        var hx=cx-hw2+(sub%1)*(hw2*2);
        ctx.strokeStyle="rgba(245,245,240,.25)";ctx.beginPath();ctx.moveTo(W*.05,y2-lh);ctx.lineTo(W*.95,y2-lh);ctx.stroke();
        ctx.fillStyle="#f5f5f0";ctx.beginPath();ctx.moveTo(hx,y2-lh+2);ctx.lineTo(hx-5,y2-lh-8);ctx.lineTo(hx+5,y2-lh-8);ctx.closePath();ctx.fill();
        ctx.fillStyle="rgba(0,229,255,.9)";ctx.fillRect(hx-1,y2-lh+2,2,4);
        sub+=.06;if(sub>=1){sub=0;layer++}
        if(layer>=NL){phase=1;setTimeout(function(){phase=2;scanY=baseY-NL*lh},900)}
      }else if(phase===2){
        // reverse-engineering scan beam
        ctx.fillStyle="rgba(0,229,255,.10)";ctx.fillRect(W*.06,scanY-2,W*.88,4);
        ctx.fillStyle="rgba(0,229,255,.9)";ctx.fillRect(W*.06,scanY,W*.88,1);
        scanY+=2.4;
        if(scanY>baseY){phase=3;setTimeout(function(){layer=0;sub=0;phase=0},1200)}
      }
      // HUD labels
      ctx.font="9px Space Mono,monospace";ctx.fillStyle="rgba(0,229,255,.7)";
      ctx.fillText(phase===2?"> SCANNING GEOMETRY...":phase===3?"> MESH RECONSTRUCTED":"LAYER "+Math.min(layer+1,NL)+"/"+NL+"  0.20 MM",12,18);
      ctx.fillStyle="rgba(245,245,240,.35)";
      ctx.fillText(phase>=2?"REVERSE ENGINEERING MODE":"ADDITIVE BUILD MODE",12,32);
      raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);
    return function(){cancelAnimationFrame(raf);window.removeEventListener("resize",fit)};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}}/>;
}

// ═══════════════════════════════════════════════════
// THE MONUMENT — a permanent, collectively-built crystal.
// Each visit hashes its own behavior (mouse, scroll, timing,
// device) into an anonymous seed; the server stores it forever and
// every seed becomes one shard in a phyllotaxis spiral. The
// visitor's own shard pulses white. The structure can only grow.
// ═══════════════════════════════════════════════════
function Monument(props){
  var lang=props.lang||"en";
  var ref=useRef(null);
  var [count,setCount]=useState(null);
  var [mine,setMine]=useState(-1);
  var seedsRef=useRef([]);
  var entropy=useRef({mx:0,md:0,sc:0,t0:performance.now()});

  // collect behavioral entropy for this visit's seed
  useEffect(function(){
    var e=entropy.current,lx=0,ly=0;
    function onMove(ev){var dx=ev.clientX-lx,dy=ev.clientY-ly;lx=ev.clientX;ly=ev.clientY;e.mx++;e.md+=Math.sqrt(dx*dx+dy*dy)}
    function onScroll(){e.sc=Math.max(e.sc,window.scrollY)}
    window.addEventListener("mousemove",onMove);window.addEventListener("scroll",onScroll);
    return function(){window.removeEventListener("mousemove",onMove);window.removeEventListener("scroll",onScroll)};
  },[]);

  // fetch the monument, then (once per session, after 8s of life) forge our shard
  useEffect(function(){
    var alive=true;
    fetch("/api/monument.php").then(function(r){return r.json()}).then(function(d){
      if(!alive||!d.ok)return;
      seedsRef.current=d.seeds||[];setCount(d.count||0);
    }).catch(function(){
      // local preview when the API isn't reachable (dev): procedural shards
      var s=[];for(var i=0;i<260;i++){var h="";for(var j=0;j<12;j++)h+="0123456789abcdef"[(i*2654435761+j*40503)%16];s.push(h)}
      seedsRef.current=s;setCount(null);
    });
    var t=setTimeout(function(){
      var e=entropy.current;
      var raw=[e.mx,Math.round(e.md),e.sc,Math.round(performance.now()-e.t0),screen.width,screen.height,
               Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.language,Date.now()].join("|");
      crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)).then(function(buf){
        var seed=Array.from(new Uint8Array(buf)).slice(0,6).map(function(b){return b.toString(16).padStart(2,"0")}).join("");
        try{if(sessionStorage.getItem("cs_shard")){return}}catch(err){}
        fetch("/api/monument.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seed:seed})})
          .then(function(r){return r.json()}).then(function(d){
            if(!alive||!d.ok)return;
            try{sessionStorage.setItem("cs_shard","1")}catch(err){}
            if(d.index>=0){seedsRef.current=seedsRef.current.concat([seed]);setMine(seedsRef.current.length-1);setCount(d.count)}
          }).catch(function(){
            // offline: still show the visitor their shard locally
            seedsRef.current=seedsRef.current.concat([seed]);setMine(seedsRef.current.length-1);
          });
      });
    },8000);
    return function(){alive=false;clearTimeout(t)};
  },[]);

  // renderer — static shards on an offscreen layer, live layer for pulse + rotation
  useEffect(function(){
    var c=ref.current;if(!c)return;
    var ctx=c.getContext("2d");
    var W,H,off,octx,builtFor=-1;
    function fit(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight;off=document.createElement("canvas");off.width=W;off.height=H;octx=off.getContext("2d");builtFor=-1}
    fit();window.addEventListener("resize",fit);
    var GA=Math.PI*(3-Math.sqrt(5)); // golden angle — phyllotaxis
    function shardGeo(seed,i,n){
      var h=parseInt(seed.substring(0,4),16)/0xffff;
      var r0=10+Math.sqrt(i)*(Math.min(W,H)*.42/Math.sqrt(Math.max(n,60)));
      var a=i*GA+h*.35;
      var len=8+(parseInt(seed.substring(4,8),16)/0xffff)*26;
      var wdt=1+(parseInt(seed.substring(8,12),16)/0xffff)*3.2;
      return {x:W/2+Math.cos(a)*r0,y:H/2+Math.sin(a)*r0,a:a,len:len,w:wdt,b:.25+h*.55};
    }
    function drawShard(g,x,y,gctx,glow){
      gctx.save();gctx.translate(x,y);gctx.rotate(g.a+Math.PI/2);
      gctx.beginPath();gctx.moveTo(0,-g.len/2);gctx.lineTo(g.w,g.len/2);gctx.lineTo(-g.w,g.len/2);gctx.closePath();
      if(glow){gctx.shadowColor="rgba(245,245,240,.9)";gctx.shadowBlur=14;gctx.fillStyle="rgba(245,245,240,"+glow+")"}
      else gctx.fillStyle="rgba(0,229,255,"+g.b*.5+")";
      gctx.fill();
      if(!glow){gctx.strokeStyle="rgba(0,229,255,"+g.b+")";gctx.lineWidth=.6;gctx.stroke()}
      gctx.restore();
    }
    var raf;
    function frame(now){
      var seeds=seedsRef.current,n=seeds.length;
      if(n!==builtFor&&octx){ // rebuild static layer only when the monument grows
        octx.clearRect(0,0,W,H);
        for(var i=0;i<n;i++){if(i===mine)continue;var g=shardGeo(seeds[i],i,n);drawShard(g,g.x,g.y,octx,null)}
        builtFor=n;
      }
      ctx.clearRect(0,0,W,H);
      var rot=Math.sin(now*.00004)*.05;
      ctx.save();ctx.translate(W/2,H/2);ctx.rotate(rot);ctx.translate(-W/2,-H/2);
      ctx.drawImage(off,0,0);
      if(mine>=0&&mine<seedsRef.current.length){
        var gm=shardGeo(seedsRef.current[mine],mine,n);
        drawShard(gm,gm.x,gm.y,ctx,.55+Math.sin(now*.004)*.35);
      }
      ctx.restore();
      // core
      ctx.fillStyle="rgba(0,229,255,"+(0.5+Math.sin(now*.002)*.2)+")";
      ctx.beginPath();ctx.arc(W/2,H/2,2.5,0,Math.PI*2);ctx.fill();
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
    return function(){cancelAnimationFrame(raf);window.removeEventListener("resize",fit)};
  },[mine]);

  var L={
    shards:{it:"FRAMMENTI",en:"SHARDS",bg:"\u0428\u0410\u0420\u0414\u0410"},
    yours:{it:"IL TUO FRAMMENTO PULSA IN BIANCO",en:"YOUR SHARD PULSES WHITE",bg:"\u0422\u0412\u041e\u042f\u0422 \u0428\u0410\u0420\u0414 \u041f\u0423\u041b\u0421\u0418\u0420\u0410 \u0412 \u0411\u042f\u041b\u041e"},
    forging:{it:"OSSERVANDO LA TUA VISITA...",en:"OBSERVING YOUR VISIT...",bg:"\u041d\u0410\u0411\u041b\u042e\u0414\u0410\u0412\u0410\u041c\u0415 \u041f\u041e\u0421\u0415\u0429\u0415\u041d\u0418\u0415\u0422\u041e \u0422\u0418..."}
  };
  function tt(k){return L[k][lang]||L[k].en}
  return <div style={{position:"relative",width:"100%",height:"100%"}}>
    <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}}/>
    <div style={{position:"absolute",top:12,left:14,fontSize:9,letterSpacing:".2em",color:"rgba(0,229,255,.7)"}}>
      {count!=null?count.toLocaleString()+" "+tt("shards"):"LOCAL PREVIEW"}
    </div>
    <div style={{position:"absolute",bottom:12,left:14,fontSize:8,letterSpacing:".2em",color:mine>=0?"#f5f5f0":"#555"}}>
      {mine>=0?"\u25c6 "+tt("yours"):"\u25cc "+tt("forging")}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
export default function App(){
  const[loaded,setLoaded]=useState(false);const[pct,setPct]=useState(0);
  const[time,setTime]=useState("00:00:00");const[bat,setBat]=useState("N/A");
  const[net,setNet]=useState("?");const[fps,setFps]=useState(60);
  const[scrollPx,setScrollPx]=useState(0);
  const[lang,setLang]=useState(function(){return detectLang()});
  // IP geolocation overrides timezone detection (IT/BG/other→EN) — but never an explicit user choice
  useEffect(function(){if(explicitLang())return;detectLangByIP(function(l){setLang(l)})},[]);
  const[showAdmin,setShowAdmin]=useState(false);
  const[mobileMenu,setMobileMenu]=useState(false);
  const[cookieOk,setCookieOk]=useState(function(){try{return localStorage.getItem("cs_cookie")!==null}catch(e){return false}});
  const[formName,setFormName]=useState("");const[formEmail,setFormEmail]=useState("");const[formPhone,setFormPhone]=useState("");const[formMsg,setFormMsg]=useState("");const[formSent,setFormSent]=useState(false);
  const fpsF=useRef([]);

  // Translation helper
  function t(key){var entry=LANGS[key];if(!entry)return key;return entry[lang]||entry.en||key}

  function handleFormSubmit(){if(!formName.trim()||!formEmail.trim()||!formMsg.trim())return;setFormSent("sending");fetch("/api/contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:formName,email:formEmail,phone:formPhone,message:formMsg,lang:lang,_gotcha:""})}).then(function(r){return r.json()}).then(function(d){if(d.ok){setFormSent("ok");setTimeout(function(){setFormSent(false);setFormName("");setFormEmail("");setFormPhone("");setFormMsg("")},5000)}else{setFormSent("error")}}).catch(function(){setFormSent("error");setTimeout(function(){setFormSent(false)},4000)})}
  function acceptCookies(){setCookieOk(true);try{localStorage.setItem("cs_cookie","accepted")}catch(e){}}
  function rejectCookies(){setCookieOk(true);try{localStorage.setItem("cs_cookie","rejected")}catch(e){}}

  // Admin panel: Ctrl+Shift+A or type "admin" in terminal
  useEffect(function(){function h(e){if(e.ctrlKey&&e.shiftKey&&e.key==="A"){e.preventDefault();setShowAdmin(function(v){return!v});}if(e.key==="Escape")setShowAdmin(false)}function adminEvt(){setShowAdmin(function(v){return!v})}window.addEventListener("keydown",h);window.addEventListener("cs-admin-toggle",adminEvt);return function(){window.removeEventListener("keydown",h);window.removeEventListener("cs-admin-toggle",adminEvt)}},[]);
  useEffect(function(){var iv=setInterval(function(){setTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}))},1000);return function(){clearInterval(iv)}},[]);
  useEffect(function(){if(navigator.getBattery)navigator.getBattery().then(function(b){function u(){setBat(Math.round(b.level*100)+"%"+(b.charging?" CHG":""))}u();b.addEventListener("levelchange",u)})},[]);
  useEffect(function(){var c=navigator.connection||navigator.mozConnection;if(c)setNet((c.effectiveType||"?").toUpperCase())},[]);
  useEffect(function(){var raf;function loop(){fpsF.current.push(performance.now());var now=performance.now();fpsF.current=fpsF.current.filter(function(t){return now-t<1000});setFps(fpsF.current.length);raf=requestAnimationFrame(loop)}loop();return function(){cancelAnimationFrame(raf)}},[]);
  useEffect(function(){function h(){setScrollPx(window.scrollY)}window.addEventListener("scroll",h,{passive:true});return function(){window.removeEventListener("scroll",h)}},[]);

  // ── Collect REAL system info for boot sequence ──
  var [sysInfo, setSysInfo] = useState({});
  useEffect(function() {
    var info = {};
    info.cores = navigator.hardwareConcurrency || "?";
    info.mem = navigator.deviceMemory ? navigator.deviceMemory + "GB" : "CLASSIFIED";
    info.platform = navigator.platform || "UNKNOWN";
    info.lang = (navigator.language || "en").toUpperCase();
    info.online = navigator.onLine ? "CONNECTED" : "OFFLINE";
    info.screen = window.screen.width + "x" + window.screen.height;
    info.depth = window.screen.colorDepth + "BIT";
    info.dpr = window.devicePixelRatio ? window.devicePixelRatio.toFixed(1) + "x" : "1x";
    info.touch = navigator.maxTouchPoints > 0 ? "YES (" + navigator.maxTouchPoints + " POINTS)" : "NO";
    info.ua = (function() {
      var u = navigator.userAgent;
      if (u.indexOf("CriOS") > -1) return "CHROME iOS";
      if (u.indexOf("FxiOS") > -1) return "FIREFOX iOS";
      if (u.indexOf("Edg") > -1) return "EDGE / CHROMIUM";
      if (u.indexOf("Chrome") > -1 && u.indexOf("Safari") > -1) return "CHROMIUM";
      if (u.indexOf("Firefox") > -1) return "GECKO / FIREFOX";
      if (u.indexOf("Safari") > -1) return "WEBKIT / SAFARI";
      return "UNKNOWN ENGINE";
    })();
    info.cookies = navigator.cookieEnabled ? "ENABLED" : "DISABLED";
    info.webgl = (function() { try { var c = document.createElement("canvas"); var g = c.getContext("webgl2") || c.getContext("webgl"); if (g) { var d = g.getExtension("WEBGL_debug_renderer_info"); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : "WEBGL SUPPORTED"; } return "NONE"; } catch(e) { return "NONE"; } })();
    info.time = new Date().toISOString();
    // Battery (async) — not supported on iOS
    if (navigator.getBattery) {
      try {
        navigator.getBattery().then(function(b) { info.battery = Math.round(b.level * 100) + "%" + (b.charging ? " CHARGING" : " DISCHARGING"); setSysInfo(Object.assign({}, info)); }).catch(function() { info.battery = "API RESTRICTED"; setSysInfo(Object.assign({}, info)); });
      } catch(e) { info.battery = "NOT AVAILABLE"; }
    } else {
      info.battery = "API NOT SUPPORTED (iOS)";
    }
    // Network
    var conn = navigator.connection || navigator.mozConnection;
    if (conn) { info.net = (conn.effectiveType || "?").toUpperCase() + " / " + (conn.downlink || "?") + " MBPS"; }
    setSysInfo(info);
  }, []);

  // ── Boot log lines (appear one by one) ──
  var [bootLines, setBootLines] = useState([]);
  var [bootPhase, setBootPhase] = useState(0); // 0=booting, 1=complete, 2=shatter
  var bootCanvasRef = useRef(null);

  useEffect(function() {
    if (loaded) return;
    var lines = [
      { delay: 100, text: "CARBON STEALTH BIOS v5.0.2026", color: C },
      { delay: 300, text: "EIK: BG208725180 — UL. SAMUIL 3, BOBOV DOL 2670, BULGARIA", color: "#ccc" },
      { delay: 500, text: "\u2500".repeat(52), color: "#ccc" },
      { delay: 700, text: "SCANNING HARDWARE...", color: "#f5f5f0" },
      { delay: 900, text: "  CPU THREADS:    " + (sysInfo.cores || "?") + " CORES DETECTED", color: C },
      { delay: 1100, text: "  MEMORY:         " + (sysInfo.mem || "SCANNING..."), color: C },
      { delay: 1250, text: "  GPU:            " + (sysInfo.webgl || "DETECTING...").substring(0, 40), color: C },
      { delay: 1400, text: "  DISPLAY:        " + (sysInfo.screen || "?") + " @ " + (sysInfo.dpr || "1x") + " DPR / " + (sysInfo.depth || "?"), color: C },
      { delay: 1550, text: "  TOUCH INPUT:    " + (sysInfo.touch || "SCANNING..."), color: C },
      { delay: 1700, text: "  NETWORK:        " + (sysInfo.net || sysInfo.online || "PROBING..."), color: C },
      { delay: 1850, text: "  BATTERY:        " + (sysInfo.battery || "N/A"), color: C },
      { delay: 2000, text: "  ENGINE:         " + (sysInfo.ua || "?"), color: C },
      { delay: 2200, text: "\u2500".repeat(52), color: "#ccc" },
      { delay: 2400, text: "INITIALIZING SUBSYSTEMS...", color: "#f5f5f0" },
      { delay: 2600, text: "  [OK] THREE.JS 3D ENGINE", color: "#00ff88" },
      { delay: 2750, text: "  [OK] WEBGL RENDER PIPELINE", color: "#00ff88" },
      { delay: 2900, text: "  [OK] CANVAS COMPOSITOR", color: "#00ff88" },
      { delay: 3050, text: "  [OK] REVERSE LAB / 3D PRINT PIPELINE", color: "#00ff88" },
      { delay: 3200, text: "  [OK] CANVAS PARTICLE ENGINE", color: "#00ff88" },
      { delay: 3350, text: "  [OK] GENERATIVE ART MODULE", color: "#00ff88" },
      { delay: 3500, text: "  [OK] VARIABLE TYPOGRAPHY ENGINE", color: "#00ff88" },
      { delay: 3650, text: "  [OK] MAGNETIC REPULSION PHYSICS", color: "#00ff88" },
      { delay: 3800, text: "\u2500".repeat(52), color: "#ccc" },
      { delay: 4000, text: "ALL SYSTEMS NOMINAL. LAUNCHING CS...", color: C },
    ];

    var timers = [];
    lines.forEach(function(line, i) {
      var t = setTimeout(function() {
        setBootLines(function(prev) { return prev.concat([line]); });
        // Update percentage
        setPct(Math.floor((i + 1) / lines.length * 100));
      }, line.delay);
      timers.push(t);
    });

    // After all lines, trigger shatter
    var finalTimer = setTimeout(function() {
      setBootPhase(1);
      // Epic boot chord
      setTimeout(function() { setBootPhase(2); }, 600);
      setTimeout(function() {
        window.scrollTo(0, 0);
        setLoaded(true);
        }, 1400);
    }, 4600);

    return function() { timers.forEach(clearTimeout); clearTimeout(finalTimer); };
  }, [sysInfo]);

  // ── Boot 3D scene — morphing wireframe that explodes on completion ──
  var bootSceneRef = useRef(null);
  useEffect(function() {
    if (loaded || !bootSceneRef.current) return;
    var el = bootSceneRef.current;
    var bootCleanup = null;
    var bootMounted = true;
    import("three").then(function(THREE) {
      if (!bootMounted || !el) return;
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 1000);
    cam.position.z = 4;
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Main morphing icosahedron
    var icoGeo = new THREE.IcosahedronGeometry(1.8, 3);
    var icoMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.15 });
    var ico = new THREE.Mesh(icoGeo, icoMat);
    scene.add(ico);
    var origIco = icoGeo.attributes.position.array.slice();

    // Inner ico
    var ico2Geo = new THREE.IcosahedronGeometry(1.2, 2);
    var ico2Mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.06 });
    var ico2 = new THREE.Mesh(ico2Geo, ico2Mat);
    scene.add(ico2);

    // Orbiting rings
    var ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.008, 4, 100), new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.06 }));
    var ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.006, 4, 120), new THREE.MeshBasicMaterial({ color: 0xf5f5f0, wireframe: true, transparent: true, opacity: 0.03 }));
    ring1.rotation.x = Math.PI / 3; ring2.rotation.x = -Math.PI / 4; ring2.rotation.z = Math.PI / 5;
    scene.add(ring1, ring2);

    // Particle field — 500 particles
    var pGeo = new THREE.BufferGeometry();
    var pN = 500;
    var pPositions = new Float32Array(pN * 3);
    var pVelocities = [];
    for (var i = 0; i < pN; i++) {
      // Distribute on sphere surface
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      var r = 1.8 + Math.random() * 0.3;
      pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPositions[i * 3 + 2] = r * Math.cos(phi);
      pVelocities.push({ x: 0, y: 0, z: 0 });
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
    var pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x00e5ff, size: 0.02, transparent: true, opacity: 0.5 }));
    scene.add(pts);
    var origParticles = pPositions.slice();

    var t = 0;
    var exploded = false;
    var explodeTime = 0;

    var bootRaf;
    function loop() {
      if (!bootMounted) return;     // boot screen unmounted — stop rendering the disposed scene
      t += 0.008;

      // Rotation
      ico.rotation.y = t * 0.3;
      ico.rotation.x = t * 0.2;
      ico2.rotation.y = -t * 0.4;
      ico2.rotation.z = t * 0.15;
      ring1.rotation.z = t * 0.1;
      ring2.rotation.y = t * 0.08;

      // Vertex displacement — breathing effect
      var positions = icoGeo.attributes.position.array;
      for (var i = 0; i < positions.length; i += 3) {
        var ox = origIco[i], oy = origIco[i + 1], oz = origIco[i + 2];
        var noise = Math.sin(ox * 4 + t * 3) * Math.cos(oy * 4 + t * 2) * Math.sin(oz * 3 + t * 2.5);
        var breathe = 1 + Math.sin(t * 1.5) * 0.08;
        var disp = exploded ? (1 + (t - explodeTime) * 3) : breathe;
        positions[i] = ox * disp + ox * noise * 0.1;
        positions[i + 1] = oy * disp + oy * noise * 0.1;
        positions[i + 2] = oz * disp + oz * noise * 0.1;
      }
      icoGeo.attributes.position.needsUpdate = true;

      // Particles — orbit or explode
      var pPos = pGeo.attributes.position.array;
      for (var i = 0; i < pN; i++) {
        if (exploded) {
          // Explode outward
          pVelocities[i].x += (pPos[i * 3]) * 0.008;
          pVelocities[i].y += (pPos[i * 3 + 1]) * 0.008;
          pVelocities[i].z += (pPos[i * 3 + 2]) * 0.008;
          pPos[i * 3] += pVelocities[i].x;
          pPos[i * 3 + 1] += pVelocities[i].y;
          pPos[i * 3 + 2] += pVelocities[i].z;
        } else {
          // Gentle orbit
          var ox = origParticles[i * 3], oy = origParticles[i * 3 + 1], oz = origParticles[i * 3 + 2];
          var angle = t * 0.3 + i * 0.01;
          pPos[i * 3] = ox * Math.cos(angle) - oz * Math.sin(angle);
          pPos[i * 3 + 1] = oy + Math.sin(t + i) * 0.1;
          pPos[i * 3 + 2] = ox * Math.sin(angle) + oz * Math.cos(angle);
        }
      }
      pGeo.attributes.position.needsUpdate = true;

      // Intensity based on boot progress
      icoMat.opacity = 0.1 + (pct / 100) * 0.2;
      pts.material.opacity = 0.3 + (pct / 100) * 0.4;

      renderer.render(scene, cam);
      bootRaf = requestAnimationFrame(loop);
    }
    loop();

    // Listen for boot phase changes to trigger explosion
    var observer = setInterval(function() {
      if (bootPhase >= 1 && !exploded) {
        exploded = true;
        explodeTime = t;
        icoMat.opacity = 0.5;
        icoMat.color.set(0xffffff);
        pts.material.size = 0.04;
      }
    }, 100);

    function onResize() { cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); }
    window.addEventListener("resize", onResize);
    bootCleanup = function() { cancelAnimationFrame(bootRaf); window.removeEventListener("resize", onResize); clearInterval(observer); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); renderer.dispose(); };
    });
    return function() { bootMounted = false; if (bootCleanup) bootCleanup(); };
  }, [loaded]);

  // ── Boot screen particle canvas ──
  useEffect(function() {
    if (loaded || !bootCanvasRef.current) return;
    var c = bootCanvasRef.current;
    var ctx = c.getContext("2d");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    var particles = [];
    for (var i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.3 + 0.05,
      });
    }
    var raf;
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      // Draw connections
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > c.width) p.vx *= -1;
        if (p.y < 0 || p.y > c.height) p.vy *= -1;
        ctx.fillStyle = "rgba(" + CR + "," + p.opacity + ")";
        ctx.fillRect(p.x, p.y, p.size, p.size);
        // Connect nearby particles
        for (var j = i + 1; j < particles.length; j++) {
          var q = particles[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(" + CR + "," + ((1 - dist / 120) * 0.08) + ")";
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return function() { cancelAnimationFrame(raf); };
  }, [loaded]);

  var HEAD="Inter Tight,sans-serif";

  // Lock scroll during boot, force top when loaded
  useEffect(function() {
    if (!loaded) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      window.scrollTo(0, 0);
    } else {
      // Triple-force scroll to top with delays to beat any browser auto-scroll
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      requestAnimationFrame(function() {
        window.scrollTo(0, 0);
        setTimeout(function() {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          document.body.style.overflow = "";
          document.documentElement.style.overflow = "";
        }, 50);
      });
    }
  }, [loaded]);

  if(!loaded)return(
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:999999,overflow:"hidden",
      opacity: bootPhase === 2 ? 0 : 1,
      transform: bootPhase === 2 ? "scale(1.1)" : "scale(1)",
      transition: bootPhase >= 1 ? "opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)" : "none",
    }}>
      <style>{"@keyframes scanBoot{from{top:-2px}to{top:100%}}@keyframes blinkCursor{50%{opacity:0}}"}</style>

      {/* Particle network background */}
      <canvas ref={bootCanvasRef} style={{position:"absolute",inset:0,zIndex:0}}/>

      {/* THREE.JS BOOT SCENE — morphing icosahedron */}
      <div ref={bootSceneRef} style={{position:"absolute",inset:0,zIndex:2,pointerEvents:"none"}}/>

      {/* Scan line */}
      <div style={{position:"absolute",left:0,width:"100%",height:"1px",background:"linear-gradient(90deg,transparent,rgba("+CR+",.15),transparent)",zIndex:3,animation:"scanBoot 2s linear infinite"}}/>

      {/* Grid */}
      <div style={{position:"absolute",inset:0,zIndex:1,backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 39px,rgba("+CR+",.03) 39px,rgba("+CR+",.03) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba("+CR+",.03) 39px,rgba("+CR+",.03) 40px)",pointerEvents:"none"}}/>

      {/* Main content */}
      <div style={{position:"relative",zIndex:5,padding:24,fontFamily:"'Space Mono',monospace",height:"100%",display:"flex",flexDirection:"column"}}>

        {/* Top bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:16,borderBottom:"1px solid rgba("+CR+",.1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:6,height:6,background:C,animation:"blinkCursor 1s steps(1) infinite"}}/>
            <span style={{fontSize:9,letterSpacing:".4em",color:C}}>CS BOOT SEQUENCE</span>
          </div>
          <span style={{fontSize:9,color:"#ddd",letterSpacing:".15em"}}>{sysInfo.time ? sysInfo.time.substring(0, 19) : ""}</span>
        </div>

        {/* Terminal boot log */}
        <div style={{flex:1,overflow:"hidden",paddingTop:16,paddingBottom:16}}>
          {bootLines.map(function(line, i) {
            return <div key={i} style={{
              fontSize: 10, lineHeight: 1.8, color: line.color,
              fontFamily: "'Space Mono', monospace", letterSpacing: ".05em",
            }}>{line.text}</div>;
          })}
          {bootPhase === 0 && <span style={{display:"inline-block",width:7,height:14,background:C,animation:"blinkCursor .6s steps(1) infinite",verticalAlign:"middle",marginLeft:2}}/>}
        </div>

        {/* Bottom section: massive percentage + progress */}
        <div style={{borderTop:"1px solid rgba("+CR+",.1)",paddingTop:20,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{fontFamily:HEAD,fontWeight:900,fontSize:"clamp(5rem,15vw,12rem)",lineHeight:.85,letterSpacing:"-.05em",color:bootPhase>=1?C:"#f5f5f0",transition:"color .4s"}}>
              {String(pct).padStart(3,"0")}
            </div>
            <div style={{fontSize:8,letterSpacing:".3em",color:"#ddd",marginTop:8}}>
              {bootPhase >= 1 ? "BOOT COMPLETE \u2014 LAUNCHING" : "SYSTEM INITIALIZATION"}
            </div>
          </div>
          <div style={{width:200}}>
            {/* Multi-layer progress bar */}
            <div style={{height:2,background:"#111",marginBottom:4,position:"relative",overflow:"hidden"}}>
              <div style={{height:"100%",background:C,width:pct+"%",transition:"width 80ms"}}/>
            </div>
            <div style={{height:1,background:"#111",marginBottom:4,position:"relative",overflow:"hidden"}}>
              <div style={{height:"100%",background:"rgba("+CR+",.4)",width:Math.min(pct*1.2,100)+"%",transition:"width 120ms"}}/>
            </div>
            <div style={{height:1,background:"#111",position:"relative",overflow:"hidden"}}>
              <div style={{height:"100%",background:"rgba("+CR+",.2)",width:Math.min(pct*1.5,100)+"%",transition:"width 160ms"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{fontSize:7,color:"#ccc",letterSpacing:".15em"}}>0%</span>
              <span style={{fontSize:7,color:"#ccc",letterSpacing:".15em"}}>PROGRESS</span>
              <span style={{fontSize:7,color:"#ccc",letterSpacing:".15em"}}>100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Corner decorations */}
      <div style={{position:"absolute",top:12,right:12,width:20,height:20,borderTop:"1px solid rgba("+CR+",.2)",borderRight:"1px solid rgba("+CR+",.2)",zIndex:6}}/>
      <div style={{position:"absolute",bottom:12,left:12,width:20,height:20,borderBottom:"1px solid rgba("+CR+",.2)",borderLeft:"1px solid rgba("+CR+",.2)",zIndex:6}}/>
      <div style={{position:"absolute",top:12,left:12,width:20,height:20,borderTop:"1px solid rgba("+CR+",.2)",borderLeft:"1px solid rgba("+CR+",.2)",zIndex:6}}/>
      <div style={{position:"absolute",bottom:12,right:12,width:20,height:20,borderBottom:"1px solid rgba("+CR+",.2)",borderRight:"1px solid rgba("+CR+",.2)",zIndex:6}}/>
    </div>);

  var parallaxFast = -scrollPx * 0.15;
  var parallaxSlow = -scrollPx * 0.05;

  return(
    <div style={{background:"#000",color:"#f5f5f0",fontFamily:"'Space Mono',monospace",fontSize:12,cursor:"crosshair",letterSpacing:".02em",position:"relative",overflowX:"hidden"}}>
      <a href="#main" className="cs-skip">{lang==="it"?"Salta al contenuto":lang==="bg"?"Към съдържанието":"Skip to content"}</a>
      {showAdmin && <AdminPanel onClose={function(){setShowAdmin(false)}} />}
      {/* Post-boot circuit trace reveal (one-shot, removes itself) */}
      <CircuitSweep />
      <style>{"::selection{background:"+C+";color:#000}*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow-x:hidden}@keyframes blink{50%{opacity:.3}}@keyframes scanH{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@keyframes tickerMove{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes diagScan{from{transform:translateY(-200%) rotate(45deg)}to{transform:translateY(200%) rotate(45deg)}}input::placeholder{color:#999}input:disabled{cursor:wait}@media(max-width:767px){.cs-lab-grid{grid-template-columns:1fr !important}}"}</style>

      {/* Generative painting canvas */}
      <CodeRain />
      <GenerativeCanvas />
      <GlitchFlash />
      <SEOInjector />
      <VelocityMeter />
      <ScrollSpeed />

      {/* Diagonal scan line */}
      <div style={{position:"fixed",left:0,width:"200%",height:1,background:"linear-gradient(90deg,transparent,rgba("+CR+",.06),transparent)",zIndex:9996,pointerEvents:"none",animation:"diagScan 6s linear infinite",transformOrigin:"center"}}/>

      {/* Grid overlay - DIAGONAL */}
      <div style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",opacity:.2,backgroundImage:"repeating-linear-gradient(45deg,rgba("+CR+",.015) 0,rgba("+CR+",.015) 1px,transparent 1px,transparent 60px),repeating-linear-gradient(-45deg,rgba("+CR+",.015) 0,rgba("+CR+",.015) 1px,transparent 1px,transparent 60px)"}}/>

      {/* NAV */}
      <nav style={{position:"fixed",top:0,left:0,width:"100%",zIndex:10000,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(245,245,240,.08)",background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,background:C,animation:"blink 1s steps(1) infinite"}}/><img src="/logo.png" alt="Carbon Stealth VCC" style={{height:28,objectFit:"contain",filter:"drop-shadow(0 0 6px rgba(0,229,255,0.3))"}}/></div>
        <div className="cs-nav-links" style={{display:"flex",gap:20,alignItems:"center"}}>{[{txt:t("nav_manifesto"),id:"about"},{txt:t("nav_services"),id:"services"},{txt:t("nav_work"),id:"portfolio"},{txt:t("nav_lab"),id:"lab"},{txt:t("nav_contact"),id:"contact"}].map(function(item){return <div key={item.txt} onClick={function(){scrollToId(item.id)}}><Scr text={item.txt} style={{fontSize:9,letterSpacing:".2em",cursor:"crosshair"}}/></div>})}<a href={lang==="it"?"/test/":lang==="bg"?"/bg/test/":"/en/test/"} style={{textDecoration:"none"}}><Scr text={t("nav_test")} style={{fontSize:9,letterSpacing:".2em",cursor:"crosshair",color:C,border:"1px solid rgba("+CR+",.3)",padding:"5px 10px"}}/></a></div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span className="cs-nav-meta" style={{fontSize:9,color:"#ccc"}}>{fps}FPS</span>
          {bat!=="N/A"&&<span className="cs-nav-meta" style={{fontSize:9,color:"#ccc"}}>{bat}</span>}
          <span className="cs-nav-meta" style={{fontSize:9,color:"#ccc"}}>{time}</span>
          <div className="cs-nav-lang" style={{display:"flex",gap:2,marginLeft:8}}>
            {["it","en","bg"].map(function(l){return <span key={l} onClick={function(){setLang(l);try{localStorage.setItem("cs_lang",l)}catch(e){}}} style={{fontSize:8,padding:"3px 6px",letterSpacing:".1em",cursor:"crosshair",background:lang===l?"rgba("+CR+",.15)":"transparent",color:lang===l?C:"#ccc",border:"1px solid "+(lang===l?"rgba("+CR+",.3)":"rgba(245,245,240,.06)"),fontWeight:lang===l?700:400,textTransform:"uppercase"}}>{l}</span>})}
          </div>
          <div className="cs-hamburger" onClick={function(){setMobileMenu(true)}}><span/><span/><span/></div>
        </div>
      </nav>

      {/* MOBILE MENU OVERLAY */}
      <div className={"cs-mobile-menu"+(mobileMenu?" open":"")} style={{position:"fixed",top:0,left:0,width:"100%",height:"100vh",background:"rgba(0,0,0,.97)",zIndex:99999,display:mobileMenu?"flex":"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,backdropFilter:"blur(12px)"}}>
        <div className="cs-mobile-menu-close" onClick={function(){setMobileMenu(false)}} style={{position:"absolute",top:16,right:16,width:40,height:40,border:"1px solid rgba("+CR+",.3)",display:"flex",alignItems:"center",justifyContent:"center",color:C,fontSize:18}}>\u2715</div>
        <img src="/logo.png" alt="CS" style={{height:36,marginBottom:12}}/>
        {[{txt:t("nav_manifesto"),id:"about"},{txt:t("nav_services"),id:"services"},{txt:t("nav_work"),id:"portfolio"},{txt:t("nav_lab"),id:"lab"},{txt:t("nav_contact"),id:"contact"}].map(function(item){return <div key={item.txt} className="cs-mobile-menu-item" onClick={function(){scrollToId(item.id);setMobileMenu(false)}} style={{fontSize:13,letterSpacing:".3em",color:"#ccc",padding:"14px 32px",border:"1px solid rgba(245,245,240,.06)",minWidth:220,textAlign:"center"}}>{item.txt}</div>})}
        <a href={lang==="it"?"/test/":lang==="bg"?"/bg/test/":"/en/test/"} className="cs-mobile-menu-item" style={{fontSize:13,letterSpacing:".3em",color:C,padding:"14px 32px",border:"1px solid rgba("+CR+",.3)",minWidth:220,textAlign:"center",textDecoration:"none"}}>{t("nav_test")}</a>
        <div style={{display:"flex",gap:6,marginTop:12}}>{["it","en","bg"].map(function(l){return <span key={l} onClick={function(){setLang(l);setMobileMenu(false);try{localStorage.setItem("cs_lang",l)}catch(e){}}} style={{fontSize:10,padding:"6px 12px",border:"1px solid "+(lang===l?"rgba("+CR+",.4)":"rgba(245,245,240,.08)"),background:lang===l?"rgba("+CR+",.12)":"transparent",color:lang===l?C:"#ccc"}}>{l.toUpperCase()}</span>})}</div>
      </div>

      <main id="main">
      {/* Accessible document heading (visually hidden; ProximityText below is decorative) */}
      <h1 style={{position:"absolute",width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}>
        Carbon Stealth VCC — {t("hero_title")}
      </h1>

      {/* ═══════════════════════════════════════════
          HERO — Viewport-spanning typography + 3D
          ═══════════════════════════════════════════ */}
      <section id="hero" aria-label={t("hero_eyebrow")} style={{position:"relative",height:"100vh",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:20}}>
        <LiquidFilter />
        <div style={{position:"absolute",inset:0,filter:"url(#liquid-distort)",zIndex:1}} aria-hidden="true"><Scene3D /></div>
        <Shockwave />
        <CursorLight />

        {/* Massive parallax background text */}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,"+(parallaxSlow-50)+"%) rotate(-5deg)",fontFamily:HEAD,fontWeight:900,fontSize:"clamp(15rem,35vw,40rem)",color:"rgba("+CR+",.04)",lineHeight:.8,whiteSpace:"nowrap",pointerEvents:"none",zIndex:0,userSelect:"none"}}>
          CS
        </div>

        {/* Coordinates floating */}
        <div style={{position:"absolute",top:80,right:20,fontSize:10,color:"#ccc",textAlign:"right",lineHeight:2.2,zIndex:5,animation:"float 4s ease-in-out infinite"}}>
          42.3482{"\u00b0"}N<br/>23.0017{"\u00b0"}E<br/>ALT:550M<br/><span style={{color:C}}>{"\u25cf"} LIVE</span>
        </div>

        <div style={{position:"relative",zIndex:10,background:"linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)",margin:"-60px -20px 0",padding:"60px 20px 0"}}>
          <div style={{fontSize:11,letterSpacing:".5em",color:C,marginBottom:28,fontWeight:700}}>{t("hero_eyebrow")}</div>

          {/* Variable weight hero text */}
          <ProximityText
            text={t("hero_title")}
            style={{fontFamily:HEAD,fontWeight:800,fontSize:"clamp(2.5rem,7vw,6rem)",textShadow:"0 2px 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,229,255,0.2)",lineHeight:.95,letterSpacing:"-.04em",textTransform:"uppercase",marginLeft:-3,color:"#f5f5f0"}}
          />

          {/* Magnetic repulsion subtitle */}
          <MagneticRepel
            text={t("hero_sub")}
            style={{fontFamily:"'Space Mono',monospace",fontSize:12,letterSpacing:".2em",color:"#ccc",marginTop:24,textTransform:"uppercase"}}
          />

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",borderTop:"1px solid rgba(245,245,240,.1)",paddingTop:18,marginTop:32}}>
            <p style={{maxWidth:340,fontSize:12,lineHeight:1.9,color:"#ddd"}}>{t("hero_desc")}</p>
            <div style={{fontSize:10,color:"#ddd",lineHeight:2,textAlign:"right"}}>{fps}FPS | {bat} | {net}<br/><span style={{color:C}}>{"\u25cf"} CS CORE ACTIVE</span></div>
          </div>
        </div>
      </section>

      {/* ═══ DIAGONAL DIVIDER ═══ */}
      <div style={{height:80,background:"linear-gradient(170deg, #000 49.5%, rgba("+CR+",.08) 49.5%, rgba("+CR+",.08) 50.5%, #000 50.5%)",position:"relative",zIndex:5}}/>

      {/* ═══════════════════════════════════════════
          ABOUT — Scroll-decode text
          ═══════════════════════════════════════════ */}
      <section id="about" style={{position:"relative",zIndex:5,padding:"120px 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:80}}>
        <Constellation />
        <div>
          <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("about_tag")}</div>
          <ScrollDecode
            text={t("about_scroll")}
            style={{fontFamily:HEAD,fontWeight:800,fontSize:"clamp(1.6rem,3.5vw,2.8rem)",lineHeight:1.2,letterSpacing:"-.02em",textTransform:"uppercase",color:"#f5f5f0",textShadow:"0 2px 20px rgba(0,0,0,0.8)"}}
          />
          <p style={{fontSize:12,lineHeight:2,color:"#ccc",maxWidth:420,marginTop:28}}>{t("about_body")}</p>
        </div>
        <div style={{paddingTop:40}}>
          {[[t("stat_1"),"120+"],[t("stat_2"),"98%"],[t("stat_3"),"IT \u00b7 EN \u00b7 BG"],[t("stat_4"),"0"]].map(function(item,i){
            return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"14px 0",borderBottom:"1px solid rgba(245,245,240,.08)"}}>
              <span style={{fontSize:9,letterSpacing:".25em",textTransform:"uppercase",color:"#ddd"}}>{item[0]}</span>
              <span style={{fontFamily:HEAD,fontWeight:900,fontSize:i===3?"2rem":"1.4rem",letterSpacing:"-.02em",color:i===3?C:"#f5f5f0"}}>{item[1]}</span></div>})}
        </div>
      </section>

      {/* ═══ REVERSED DIAGONAL ═══ */}
      <div style={{height:80,background:"linear-gradient(10deg, #000 49.5%, rgba("+CR+",.06) 49.5%, rgba("+CR+",.06) 50.5%, #000 50.5%)",position:"relative",zIndex:5}}/>

      {/* ═══════════════════════════════════════════
          SERVICES — Oversized index numbers
          ═══════════════════════════════════════════ */}
      <section id="services" style={{position:"relative",zIndex:5,padding:"120px 20px"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("srv_tag")}</div>
        <ProximityText text={t("srv_title")} style={{fontFamily:HEAD,fontSize:"clamp(2rem,5vw,4rem)",letterSpacing:"-.03em",textTransform:"uppercase",marginBottom:48,color:"#f5f5f0",fontWeight:700}}/>

        {(SRV_DATA[lang]||SRV_DATA.en).map(function(s,i){
          return <div key={i} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:20,padding:"28px 0",borderBottom:"1px solid rgba(245,245,240,.08)",position:"relative"}}>
            <div style={{fontFamily:HEAD,fontWeight:900,fontSize:"3.5rem",color:"rgba("+CR+",.06)",lineHeight:1,letterSpacing:"-.03em"}}>{s.n}</div>
            <div>
              <div style={{fontFamily:HEAD,fontWeight:700,fontSize:"1.1rem",textTransform:"uppercase",letterSpacing:"-.01em",marginBottom:6,color:"#f5f5f0"}}>{s.t}</div>
              <div style={{fontSize:10,color:"#ddd",lineHeight:1.8,marginBottom:8}}>{s.d}</div>
              <div style={{fontSize:8,letterSpacing:".2em",color:C}}>{s.tags}</div>
            </div>
          </div>})}
      </section>

      {/* ═══ FULL-WIDTH BREAK TEXT ═══ */}
      <div style={{position:"relative",zIndex:5,padding:"80px 0",overflow:"hidden"}}>
        <div style={{fontFamily:HEAD,fontWeight:900,fontSize:"clamp(4rem,18vw,18rem)",color:"rgba("+CR+",.04)",whiteSpace:"nowrap",transform:"translateX("+(parallaxFast*2)+"px)",lineHeight:.9,userSelect:"none"}}>
          CARBON{"\u00b7"}STEALTH{"\u00b7"}VCC{"\u00b7"}CARBON{"\u00b7"}STEALTH{"\u00b7"}VCC
        </div>
      </div>

      {/* ═══ ASCII SCULPTURE ═══ */}
      <section style={{position:"relative",zIndex:5,padding:"40px 20px 80px",borderTop:"1px solid rgba(245,245,240,.08)"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20,textAlign:"center"}}>{lang==="it"?"// ASCII GENERATIVO — CALCOLATO IN TEMPO REALE":lang==="bg"?"// \u0413\u0415\u041D\u0415\u0420\u0410\u0422\u0418\u0412\u041D\u041E ASCII — \u0418\u0417\u0427\u0418\u0421\u041B\u0415\u041D\u041E \u0412 \u0420\u0415\u0410\u041B\u041D\u041E \u0412\u0420\u0415\u041C\u0415":"// GENERATIVE ASCII — REAL-TIME COMPUTED"}</div>
        <ASCIISculpture />
      </section>

      {/* ═══════════════════════════════════════════
          WORLD'S FIRST — Technology innovation badges
          ═══════════════════════════════════════════ */}
      <section style={{position:"relative",zIndex:5,padding:"100px 20px",borderTop:"1px solid rgba("+CR+",.15)",borderBottom:"1px solid rgba("+CR+",.15)",background:"rgba("+CR+",.01)"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20,textAlign:"center"}}>{lang==="it"?"// PRIMI AL MONDO — TECNOLOGIE PIONIERISTICHE SU QUESTO SITO":lang==="bg"?"// \u0421\u0412\u0415\u0422\u041E\u0412\u041D\u0418 \u041F\u042A\u0420\u0412\u0415\u041D\u0421\u0422\u0412\u0410 — \u0422\u0415\u0425\u041D\u041E\u041B\u041E\u0413\u0418\u0418 \u041F\u0418\u041E\u041D\u0415\u0420\u0418 \u041D\u0410 \u0422\u041E\u0417\u0418 \u0421\u0410\u0419\u0422":"// WORLD FIRSTS — TECHNOLOGIES PIONEERED ON THIS WEBSITE"}</div>
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontFamily:HEAD,fontWeight:900,fontSize:"clamp(1.5rem,4vw,3rem)",textTransform:"uppercase",letterSpacing:"-.02em",color:"#f5f5f0"}}>
            {lang==="it"?"PRIMI AL MONDO":lang==="bg"?"\u041F\u042A\u0420\u0412\u0418 \u0412 \u0421\u0412\u0415\u0422\u0410":"WORLD FIRSTS"}
          </div>
          <p style={{fontSize:11,color:"#ccc",maxWidth:500,margin:"12px auto 0",lineHeight:1.8}}>
            {lang==="it"?"Tecnologie mai combinate prima su un singolo sito web. Ogni badge rappresenta un primato mondiale.":lang==="bg"?"\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0438 \u043d\u0438\u043a\u043e\u0433\u0430 \u043d\u0435\u043a\u043e\u043c\u0431\u0438\u043d\u0438\u0440\u0430\u043d\u0438 \u043f\u0440\u0435\u0434\u0438 \u0432 \u0435\u0434\u0438\u043d \u0441\u0430\u0439\u0442. \u0412\u0441\u0435\u043a\u0438 \u0431\u0430\u0434\u0436 \u0435 \u0441\u0432\u0435\u0442\u043e\u0432\u0435\u043d \u043f\u0440\u0438\u043c\u0430\u0442.":"Technologies never combined before on a single website. Each badge represents a world first."}
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:2,maxWidth:1100,margin:"0 auto"}}>
          {[
            {id:"WF-001",title:"LIVE PRINT FORGE",desc:lang==="it"?"Stampante 3D simulata in canvas: il pezzo nasce strato per strato in tempo reale":lang==="bg"?"\u0421\u0438\u043c\u0443\u043b\u0438\u0440\u0430\u043d 3D \u043f\u0440\u0438\u043d\u0442\u0435\u0440 \u0432 canvas: \u0447\u0430\u0441\u0442\u0442\u0430 \u0441\u0435 \u0440\u0430\u0436\u0434\u0430 \u0441\u043b\u043e\u0439 \u043f\u043e \u0441\u043b\u043e\u0439 \u0432 \u0440\u0435\u0430\u043b\u043d\u043e \u0432\u0440\u0435\u043c\u0435":"Simulated 3D printer in canvas: the part is built layer by layer in real time",tech:"CANVAS 2D + ADDITIVE SIM",year:"2026"},
            {id:"WF-011",title:"LIVING MONUMENT",desc:lang==="it"?"Cristallo permanente costruito dal comportamento di ogni visitatore \u2014 pu\u00f2 solo crescere":lang==="bg"?"\u041f\u0435\u0440\u043c\u0430\u043d\u0435\u043d\u0442\u0435\u043d \u043a\u0440\u0438\u0441\u0442\u0430\u043b, \u0438\u0437\u0433\u0440\u0430\u0436\u0434\u0430\u043d \u043e\u0442 \u043f\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u0435\u0442\u043e \u043d\u0430 \u0432\u0441\u0435\u043a\u0438 \u043f\u043e\u0441\u0435\u0442\u0438\u0442\u0435\u043b \u2014 \u043c\u043e\u0436\u0435 \u0441\u0430\u043c\u043e \u0434\u0430 \u0440\u0430\u0441\u0442\u0435":"Permanent crystal grown from every visitor's behavior \u2014 it can only get bigger",tech:"SHA-256 ENTROPY + PHYLLOTAXIS",year:"2026"},
            {id:"WF-002",title:"8K PARTICLE TEXT",desc:lang==="it"?"8.000 particelle GLSL che formano testo e reagiscono al cursore":lang==="bg"?"8000 GLSL \u0447\u0430\u0441\u0442\u0438\u0446\u0438 \u0444\u043e\u0440\u043c\u0438\u0440\u0430\u0449\u0438 \u0442\u0435\u043a\u0441\u0442 \u0438 \u0440\u0435\u0430\u0433\u0438\u0440\u0430\u0449\u0438 \u043d\u0430 \u043a\u0443\u0440\u0441\u043e\u0440\u0430":"8,000 GLSL particles forming text with mouse repulsion physics",tech:"THREE.JS + CUSTOM GLSL SHADERS",year:"2026"},
            {id:"WF-003",title:"HARDWARE BIOS BOOT",desc:lang==="it"?"Scansione hardware reale del dispositivo (CPU, GPU, RAM, batteria, rete)":lang==="bg"?"\u0420\u0435\u0430\u043b\u043d\u043e \u0441\u043a\u0430\u043d\u0438\u0440\u0430\u043d\u0435 \u043d\u0430 \u0445\u0430\u0440\u0434\u0443\u0435\u0440 (CPU, GPU, RAM, \u0431\u0430\u0442\u0435\u0440\u0438\u044f)":"Real device hardware scan (CPU, GPU, RAM, battery, network)",tech:"NAVIGATOR API + WEBGL_DEBUG",year:"2026"},
            {id:"WF-004",title:"SVG LIQUID DISTORTION",desc:lang==="it"?"Filtro SVG feTurbulence animato applicato all'intero hero in tempo reale":lang==="bg"?"\u0410\u043d\u0438\u043c\u0438\u0440\u0430\u043d SVG feTurbulence \u0444\u0438\u043b\u0442\u044a\u0440 \u0432\u044a\u0440\u0445\u0443 \u0446\u044f\u043b\u043e\u0442\u043e hero":"Animated SVG feTurbulence filter applied to entire hero section",tech:"SVG FILTER + REQUESTANIMATIONFRAME",year:"2026"},
            {id:"WF-005",title:"VARIABLE WEIGHT TYPOGRAPHY",desc:lang==="it"?"Peso del font (100-900) che cambia in base alla distanza del cursore":lang==="bg"?"\u0422\u0435\u0433\u043b\u043e \u043d\u0430 \u0448\u0440\u0438\u0444\u0442\u0430 (100-900) \u0441\u043f\u043e\u0440\u0435\u0434 \u0440\u0430\u0437\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043e\u0442 \u043a\u0443\u0440\u0441\u043e\u0440\u0430":"Font weight (100-900) changes based on cursor proximity distance",tech:"VARIABLE FONTS + MOUSE TRACKING",year:"2026"},
            {id:"WF-006",title:"MAGNETIC TEXT REPULSION",desc:lang==="it"?"Lettere che si respingono fisicamente dal cursore con calcolo angolare":lang==="bg"?"\u0411\u0443\u043a\u0432\u0438 \u043a\u043e\u0438\u0442\u043e \u0441\u0435 \u043e\u0442\u0431\u043b\u044a\u0441\u043a\u0432\u0430\u0442 \u043e\u0442 \u043a\u0443\u0440\u0441\u043e\u0440\u0430 \u0441 \u0444\u0438\u0437\u0438\u043a\u0430":"Letters physically repel from cursor with angular force calculation",tech:"DOM POSITION + TRIGONOMETRY",year:"2026"},
            {id:"WF-007",title:"GENERATIVE CANVAS PAINTING",desc:lang==="it"?"Il cursore lascia segni permanenti — ogni visitatore crea un'opera unica":lang==="bg"?"\u041a\u0443\u0440\u0441\u043e\u0440\u044a\u0442 \u043e\u0441\u0442\u0430\u0432\u044f \u043f\u0435\u0440\u043c\u0430\u043d\u0435\u043d\u0442\u043d\u0438 \u0441\u043b\u0435\u0434\u0438 \u2014 \u0432\u0441\u0435\u043a\u0438 \u043f\u043e\u0441\u0435\u0442\u0438\u0442\u0435\u043b \u0441\u044a\u0437\u0434\u0430\u0432\u0430 \u0443\u043d\u0438\u043a\u0430\u043b\u043d\u043e":"Cursor leaves permanent marks — every visitor creates unique artwork",tech:"CANVAS 2D + NO CLEAR",year:"2026"},
            {id:"WF-008",title:"PHOSPHOR CURSOR TRAIL",desc:lang==="it"?"Scia luminosa CRT con persistenza fosforo — il cursore emette luce":lang==="bg"?"CRT \u0441\u0432\u0435\u0442\u043b\u0438\u043d\u043d\u0430 \u0441\u043b\u0435\u0434\u0430 \u0441 \u0444\u043e\u0441\u0444\u043e\u0440\u043d\u0430 \u043f\u0435\u0440\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u043d\u043e\u0441\u0442":"CRT-style phosphor persistence light trail from cursor movement",tech:"RADIAL GRADIENT + ALPHA FADE",year:"2026"},
            {id:"WF-009",title:"30+ BROWSER APIs",desc:lang==="it"?"Piu di 30 API browser usate simultaneamente in un singolo file React":lang==="bg"?"\u041d\u0430\u0434 30 \u0431\u0440\u0430\u0443\u0437\u044a\u0440 API \u0438\u0437\u043f\u043e\u043b\u0437\u0432\u0430\u043d\u0438 \u0435\u0434\u043d\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u0432 \u0435\u0434\u0438\u043d React \u0444\u0430\u0439\u043b":"Over 30 browser APIs used simultaneously in a single React file",tech:"WEB AUDIO + SPEECH + BATTERY + NET",year:"2026"},
            {id:"WF-010",title:"2000+ LINES / 1 FILE",desc:lang==="it"?"Oltre 2.000 righe di React con 3D, audio, fisica e schema SEO in un file":lang==="bg"?"\u041d\u0430\u0434 2000 \u0440\u0435\u0434\u0430 React \u0441 3D, \u0430\u0443\u0434\u0438\u043e, \u0444\u0438\u0437\u0438\u043a\u0430 \u0438 SEO \u0441\u0445\u0435\u043c\u0438 \u0432 \u0435\u0434\u0438\u043d \u0444\u0430\u0439\u043b":"Over 2,000 lines of React with 3D, audio, physics and SEO schemas in one file",tech:"REACT + THREE.JS + WEBGL",year:"2026"},
          ].map(function(wf,i){
            return <div key={i} style={{border:"1px solid rgba("+CR+",.12)",padding:"20px 16px",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:190,position:"relative",overflow:"hidden"}}>
              {/* Background glow */}
              <div style={{position:"absolute",top:0,right:0,width:60,height:60,background:"radial-gradient(circle,rgba("+CR+",.06) 0%,transparent 70%)",pointerEvents:"none"}}/>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <span style={{fontSize:7,letterSpacing:".3em",color:C,fontWeight:700}}>{wf.id}</span>
                  <span style={{fontSize:7,letterSpacing:".15em",color:"#ccc",background:"rgba("+CR+",.08)",padding:"2px 6px"}}>{wf.year}</span>
                </div>
                <div style={{fontFamily:HEAD,fontWeight:800,fontSize:"0.85rem",textTransform:"uppercase",letterSpacing:"-.01em",color:"#f5f5f0",marginBottom:8,lineHeight:1.2}}>{wf.title}</div>
                <div style={{fontSize:9,color:"#ccc",lineHeight:1.7}}>{wf.desc}</div>
              </div>
              <div style={{fontSize:7,letterSpacing:".2em",color:C,marginTop:12,paddingTop:8,borderTop:"1px solid rgba("+CR+",.1)"}}>{wf.tech}</div>
            </div>
          })}
        </div>
        <div style={{textAlign:"center",marginTop:32}}>
          <div style={{fontSize:8,color:"#ccc",letterSpacing:".2em"}}>{lang==="it"?"CARBON STEALTH VCC \u00b7 10 PRIMATI MONDIALI \u00b7 1 SITO WEB \u00b7 2026":lang==="bg"?"CARBON STEALTH VCC \u00b7 10 \u0421\u0412\u0415\u0422\u041E\u0412\u041D\u0418 \u041F\u042A\u0420\u0412\u0415\u041D\u0421\u0422\u0412\u0410 \u00b7 1 \u0421\u0410\u0419\u0422 \u00b7 2026":"CARBON STEALTH VCC \u00b7 10 WORLD FIRSTS \u00b7 1 WEBSITE \u00b7 2026"}</div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          WORK — Split layout with massive type
          ═══════════════════════════════════════════ */}
      <section id="portfolio" style={{position:"relative",zIndex:5,padding:"80px 20px 120px"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("work_tag")}</div>
        <EchoText fontFamily={HEAD} fontSize="clamp(2rem,5vw,4rem)" letterSpacing="-.03em">{t("work_title")}</EchoText>
        <div style={{height:48}}/>

        {[["001","NEXUS DOMINION","BROWSER MMO","https://nexus.carbonstealth.eu"],["002","OU VAPTSAROV","SCHOOL WEBSITE","https://ouvaptsarov.com"],["003","ERP ASCENSORI","ERP SYSTEM","https://erp.carbonstealth.eu"],["004","CS ANTICHEAT v4.0","FIVEM 40+ MODULES","https://ac.carbonstealth.eu"],["005","TRETI MART","MARKETPLACE BG","https://tretimart.carbonstealth.eu"]].map(function(w){
          return <a key={w[0]} href={w[3]} target="_blank" rel="noopener" style={{display:"grid",gridTemplateColumns:"60px 1fr auto",gap:16,padding:"16px 0",borderBottom:"1px solid rgba(245,245,240,.08)",cursor:"crosshair",textDecoration:"none",color:"inherit"}}>
            <span style={{fontSize:9,color:"#ccc",letterSpacing:".2em"}}>{w[0]}</span>
            <Scr text={w[1]} style={{fontFamily:HEAD,fontWeight:700,fontSize:"1rem",textTransform:"uppercase",letterSpacing:"-.01em"}}/>
            <span style={{fontSize:9,color:"#ccc",letterSpacing:".15em",textTransform:"uppercase"}}>{w[2]}</span></a>})}
      </section>

      {/* ═══════════════════════════════════════════
          PRODUCTS — Live platforms
          ═══════════════════════════════════════════ */}
      <section id="products" style={{position:"relative",zIndex:5,padding:"80px 20px 120px",borderTop:"1px solid rgba(245,245,240,.08)"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("prod_tag")}</div>
        <ProximityText text={t("prod_title")} style={{fontFamily:HEAD,fontSize:"clamp(1.5rem,4vw,3rem)",letterSpacing:"-.03em",textTransform:"uppercase",marginBottom:40,color:"#f5f5f0",fontWeight:700}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
          {[
            {name:"Nexus Dominion",desc:"MMO browser game dark fantasy medievale. Gilde, dungeon, battaglie PvP ed economia gestita dai giocatori.",url:"https://nexus.carbonstealth.eu",tag:"GAMING"},
            {name:"CS Anti-Cheat",desc:"Portale anti-cheat per server FiveM/GTA V. Scanner avanzato, detection in tempo reale e ban automatico.",url:"https://ac.carbonstealth.eu",tag:"SECURITY"},
            {name:"Treti Mart",desc:"Il marketplace bulgaro. Compra e vendi prodotti in Bulgaria con annunci gratuiti e pagamenti sicuri.",url:"https://tretimart.carbonstealth.eu",tag:"MARKETPLACE"},
            {name:"CS ERP Demo",desc:"Demo live del sistema ERP. Prova moduli CRM, magazzino, contabilita e dashboard BI.",url:"https://erp.carbonstealth.eu",tag:"ERP"},
          ].map(function(p,i){
            return <a key={i} href={p.url} target="_blank" rel="noopener" style={{border:"1px solid rgba(245,245,240,.06)",padding:"24px 18px",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:180,textDecoration:"none",color:"inherit",cursor:"crosshair",background:"rgba("+CR+",.01)"}}>
              <div>
                <div style={{fontSize:8,letterSpacing:".3em",color:C,marginBottom:8}}>{p.tag}</div>
                <div style={{fontFamily:HEAD,fontWeight:700,fontSize:"1rem",textTransform:"uppercase",marginBottom:8,color:"#f5f5f0"}}>{p.name}</div>
                <div style={{fontSize:10,color:"#ccc",lineHeight:1.8}}>{p.desc}</div>
              </div>
              <div style={{fontSize:8,letterSpacing:".15em",color:C,marginTop:14,paddingTop:10,borderTop:"1px solid rgba(245,245,240,.06)"}}>{p.url.replace("https://","")} {"\u2192"}</div>
            </a>
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          REVERSE LAB — reverse engineering + 3D printing
          ═══════════════════════════════════════════ */}
      <section id="lab" style={{position:"relative",zIndex:5,padding:"80px 20px 120px",borderTop:"1px solid rgba(245,245,240,.08)"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("lab_tag")}</div>
        <ProximityText text={t("lab_title")} style={{fontFamily:HEAD,fontSize:"clamp(2rem,5vw,4rem)",letterSpacing:"-.03em",textTransform:"uppercase",marginBottom:12,color:"#f5f5f0",fontWeight:700}}/>
        <p style={{fontSize:12,color:"#ccc",marginBottom:28,maxWidth:560,lineHeight:1.9}}>{t("lab_desc")}</p>
        <div className="cs-lab-grid" style={{display:"grid",gridTemplateColumns:"minmax(280px,1fr) minmax(280px,1fr)",gap:2,alignItems:"stretch"}}>
          <div style={{border:"1px solid rgba("+CR+",.15)",background:"rgba("+CR+",.02)",minHeight:340,position:"relative"}}>
            <PrintForge/>
          </div>
          <div style={{border:"1px solid rgba(245,245,240,.06)",padding:"28px 24px",display:"flex",flexDirection:"column",justifyContent:"center",gap:18}}>
            {[t("lab_b1"),t("lab_b2"),t("lab_b3")].map(function(b,i){
              return <div key={i} style={{display:"flex",gap:14,alignItems:"baseline"}}>
                <span style={{color:C,fontSize:10,letterSpacing:".2em",flexShrink:0}}>{"0"+(i+1)}</span>
                <span style={{fontSize:11,color:"#ddd",lineHeight:1.8,letterSpacing:".05em"}}>{b}</span>
              </div>
            })}
            <div onClick={function(){scrollToId("contact")}} style={{marginTop:10,padding:"12px 24px",border:"1px solid "+C,color:C,fontSize:10,letterSpacing:".25em",cursor:"crosshair",alignSelf:"flex-start"}}>{t("lab_cta")}</div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          THE MONUMENT — permanent visitor-built crystal
          ═══════════════════════════════════════════ */}
      <section id="monument" style={{position:"relative",zIndex:5,padding:"80px 20px 120px",borderTop:"1px solid rgba(245,245,240,.08)"}}>
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("mon_tag")}</div>
        <ProximityText text={t("mon_title")} style={{fontFamily:HEAD,fontSize:"clamp(2rem,5vw,4rem)",letterSpacing:"-.03em",textTransform:"uppercase",marginBottom:12,color:"#f5f5f0",fontWeight:700}}/>
        <p style={{fontSize:12,color:"#ccc",marginBottom:28,maxWidth:560,lineHeight:1.9}}>{t("mon_desc")}</p>
        <div style={{border:"1px solid rgba("+CR+",.15)",background:"radial-gradient(circle at 50% 50%, rgba("+CR+",.04), transparent 70%)",height:"min(72vh,560px)",position:"relative"}}>
          <Monument lang={lang}/>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="contact" style={{position:"relative",zIndex:5,padding:"100px 20px",borderTop:"1px solid rgba(245,245,240,.08)"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <EchoText fontFamily={HEAD} fontSize="clamp(2rem,6vw,5rem)" lineHeight=".9" letterSpacing="-.04em" color={C}>{t("cta_title")}</EchoText>
          <div style={{height:24}}/>
          <MagneticRepel text={t("cta_sub")} style={{fontSize:10,letterSpacing:".15em",color:"#ccc",marginBottom:32}}/>

          {/* ═══ CONTACT FORM ═══ */}
          {formSent==="ok"||formSent==="sending" ? (
            <div style={{padding:"40px 20px",border:"1px solid rgba(0,255,136,.3)",textAlign:"center"}}>
              <div style={{fontFamily:HEAD,fontWeight:900,fontSize:18,color:"#00ff88",marginBottom:8}}>{formSent==="sending"?(lang==="it"?"INVIO IN CORSO...":lang==="bg"?"\u0418\u0417\u041F\u0420\u0410\u0429\u0410\u041D\u0415...":"SENDING..."):(lang==="it"?"INVIATO!":lang==="bg"?"\u0418\u0417\u041F\u0420\u0410\u0422\u0415\u041D\u041E!":"SENT!")}</div>
              <p style={{fontSize:11,color:"#ccc"}}>{t("form_sent")}</p>
            </div>
          ) : (
            <form onSubmit={function(e){e.preventDefault();handleFormSubmit()}} style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <input value={formName} onChange={function(e){setFormName(e.target.value)}} placeholder={t("form_name")} aria-label={t("form_name")} required style={{background:"rgba(245,245,240,.03)",border:"1px solid rgba(245,245,240,.1)",color:"#f5f5f0",padding:"14px 16px",fontSize:11,fontFamily:"'Space Mono',monospace"}}/>
                <input value={formEmail} onChange={function(e){setFormEmail(e.target.value)}} placeholder={t("form_email")} aria-label={t("form_email")} type="email" required style={{background:"rgba(245,245,240,.03)",border:"1px solid rgba(245,245,240,.1)",color:"#f5f5f0",padding:"14px 16px",fontSize:11,fontFamily:"'Space Mono',monospace"}}/>
              </div>
              <input value={formPhone} onChange={function(e){setFormPhone(e.target.value)}} placeholder={t("form_phone")} aria-label={t("form_phone")} type="tel" style={{background:"rgba(245,245,240,.03)",border:"1px solid rgba(245,245,240,.1)",color:"#f5f5f0",padding:"14px 16px",fontSize:11,fontFamily:"'Space Mono',monospace"}}/>
              <textarea value={formMsg} onChange={function(e){setFormMsg(e.target.value)}} placeholder={t("form_msg")} aria-label={t("form_msg")} required rows={5} style={{background:"rgba(245,245,240,.03)",border:"1px solid rgba(245,245,240,.1)",color:"#f5f5f0",padding:"14px 16px",fontSize:11,fontFamily:"'Space Mono',monospace",resize:"vertical"}}/>
              <p style={{fontSize:9,color:"#999",lineHeight:1.6}}>{t("form_gdpr")} <a href={lang==="bg"?"/bg/privacy/":lang==="en"?"/en/privacy/":"/privacy/"} style={{color:C,textDecoration:"none"}}>{lang==="it"?"Informativa Privacy":lang==="bg"?"\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0437\u0430 \u041F\u043E\u0432\u0435\u0440\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442":"Privacy Policy"}</a>.</p>
              {formSent==="error" && <div role="alert" style={{padding:"12px 16px",border:"1px solid rgba(255,51,102,.4)",background:"rgba(255,51,102,.06)",color:"#ff6688",fontSize:11,lineHeight:1.6}}>{lang==="it"?"Invio non riuscito. Riprova o scrivici direttamente a info@carbonstealth.eu":lang==="bg"?"\u0418\u0437\u043F\u0440\u0430\u0449\u0430\u043D\u0435\u0442\u043E \u0435 \u043D\u0435\u0443\u0441\u043F\u0435\u0448\u043D\u043E. \u041E\u043F\u0438\u0442\u0430\u0439\u0442\u0435 \u043E\u0442\u043D\u043E\u0432\u043E \u0438\u043B\u0438 \u043D\u0438 \u043F\u0438\u0448\u0435\u0442\u0435 \u043D\u0430 info@carbonstealth.eu":"Send failed. Please try again or email us at info@carbonstealth.eu"}</div>}
              <button type="submit" style={{display:"inline-block",padding:"14px 36px",border:"1px solid "+C,fontSize:10,letterSpacing:".3em",textTransform:"uppercase",cursor:"pointer",color:C,background:"transparent",textAlign:"center",marginTop:8,fontFamily:"'Space Mono',monospace"}}>{t("form_send")}</button>
            </form>
          )}

          {/* Direct contacts */}
          <div style={{display:"flex",flexWrap:"wrap",gap:20,marginTop:32,paddingTop:20,borderTop:"1px solid rgba(245,245,240,.06)"}}>
            <a href="https://wa.me/393792969699" style={{fontSize:10,color:"#ccc",textDecoration:"none"}}>WhatsApp: +39 379 296 9699</a>
            <a href="tel:+359877414874" style={{fontSize:10,color:"#ccc",textDecoration:"none"}}>BG: +359 877 414 874</a>
            <a href="mailto:info@carbonstealth.eu" style={{fontSize:10,color:C,textDecoration:"none"}}>info@carbonstealth.eu</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      {/* ═══════════════════════════════════════════
          FAQ — AEO Optimized for AI Answer Engines
          ═══════════════════════════════════════════ */}
      <section id="faq" style={{position:"relative",zIndex:5,padding:"100px 20px",borderTop:"1px solid rgba(245,245,240,.08)"}} itemScope itemType="https://schema.org/FAQPage">
        <div style={{fontSize:9,letterSpacing:".5em",color:C,marginBottom:20}}>{t("faq_tag")}</div>
        <ProximityText text={t("faq_title")} style={{fontFamily:HEAD,fontSize:"clamp(1.5rem,4vw,3rem)",letterSpacing:"-.03em",textTransform:"uppercase",marginBottom:40,color:"#f5f5f0",fontWeight:700}}/>
        {({
          it: [
            ["Quali servizi offre Carbon Stealth VCC?", "Carbon Stealth offre sviluppo web (React, Node.js, PostgreSQL), sviluppo giochi (FiveM, browser MMO), sistemi embedded e IoT (PLC, Modbus, Eurotherm), DevOps (Docker, Nginx, Hetzner VPS), branding e design, e consulenza tecnica."],
            ["Dove si trova Carbon Stealth?", "Sede legale a Bobov Dol, Bulgaria (EIK: BG208725180, indirizzo: ul. Samuil 3, 2670). Serviamo clienti da remoto in tutta Europa e nel mondo."],
            ["Cos'\u00e8 Nexus Dominion?", "Un MMO browser dark fantasy medievale costruito con React, Vite, Node.js, TypeScript, Prisma, PostgreSQL, Redis, Socket.IO e Docker. Include 52+ modelli database, 27 pagine di gioco e combattimento PvP in tempo reale."],
            ["Carbon Stealth sviluppa risorse FiveM?", "S\u00ec. CS Anticheat v4.0 ha 40+ moduli di rilevamento incluso il DMA behavioral scoring. Inoltre: sistemi tablet meccanico, script rapina in banca e risorse racing. Supporto multi-framework QBCore e ESX."],
            ["Con quali sistemi embedded e IoT lavorate?", "Controller forni Eurotherm EPC3004 via Modbus RTU/TCP, PLC WAGO PFC200 con CODESYS, schede controllo ascensori con 102 punti I/O e macchine a 14 stati, dispositivi IoT Arduino/ESP32."],
            ["Qual \u00e8 lo stack tecnologico?", "React, Node.js, TypeScript, Python, Prisma ORM, PostgreSQL, Redis, Docker, Nginx, Three.js, WebGL, GSAP, Socket.IO. Infrastruttura: Hetzner VPS, Ubuntu 24.04, Let's Encrypt SSL."],
          ],
          en: [
            ["What services does Carbon Stealth VCC offer?", "Carbon Stealth offers web development (React, Node.js, PostgreSQL), game development (FiveM, browser MMOs), embedded systems (PLC, Modbus, Eurotherm), DevOps (Docker, Nginx, Hetzner VPS), branding, and code rescue consulting."],
            ["Where is Carbon Stealth located?", "Based in Bobov Dol, Bulgaria (EIK: BG208725180, address: ul. Samuil 3, 2670). Serving clients remotely across Europe and worldwide."],
            ["What is Nexus Dominion?", "A medieval dark fantasy browser MMO built with React, Vite, Node.js, TypeScript, Prisma, PostgreSQL, Redis, Socket.IO, and Docker. Features 52+ database models, 27 game pages, and real-time PvP combat."],
            ["Does Carbon Stealth build FiveM resources?", "Yes. CS Anticheat v4.0 has 40+ detection modules including DMA behavioral scoring. Also: mechanic tablet systems, bank heist scripts, and racing resources. Multi-framework QBCore and ESX support."],
            ["What embedded and IoT systems does Carbon Stealth work with?", "Eurotherm EPC3004 oven controllers via Modbus RTU/TCP, WAGO PFC200 PLCs with CODESYS, elevator control boards with 102 I/O points and 14-state state machines, Arduino/ESP32 IoT devices."],
            ["What is the tech stack?", "React, Node.js, TypeScript, Python, Prisma ORM, PostgreSQL, Redis, Docker, Nginx, Three.js, WebGL, GSAP, Socket.IO. Infrastructure: Hetzner VPS, Ubuntu 24.04, Let's Encrypt SSL."],
          ],
          bg: [
            ["\u041A\u0430\u043A\u0432\u0438 \u0443\u0441\u043B\u0443\u0433\u0438 \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430 Carbon Stealth VCC?", "Carbon Stealth \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430 \u0443\u0435\u0431 \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 (React, Node.js, PostgreSQL), \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u043D\u0430 \u0438\u0433\u0440\u0438 (FiveM, \u0431\u0440\u0430\u0443\u0437\u044A\u0440 MMO), \u0432\u0433\u0440\u0430\u0434\u0435\u043D\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u0438 IoT (PLC, Modbus, Eurotherm), DevOps (Docker, Nginx, Hetzner VPS), \u0431\u0440\u0430\u043D\u0434\u0438\u043D\u0433 \u0438 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u043A\u043E\u043D\u0441\u0443\u043B\u0442\u0430\u0446\u0438\u0438."],
            ["\u041A\u044A\u0434\u0435 \u0441\u0435 \u043D\u0430\u043C\u0438\u0440\u0430 Carbon Stealth?", "\u0421\u0435\u0434\u0430\u043B\u0438\u0449\u0435 \u0432 \u0411\u043E\u0431\u043E\u0432 \u0434\u043E\u043B, \u0411\u044A\u043B\u0433\u0430\u0440\u0438\u044F (\u0415\u0418\u041A: BG208725180, \u0430\u0434\u0440\u0435\u0441: \u0443\u043B. \u0421\u0430\u043C\u0443\u0438\u043B 3, 2670). \u041E\u0431\u0441\u043B\u0443\u0436\u0432\u0430\u043C\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0438 \u0434\u0438\u0441\u0442\u0430\u043D\u0446\u0438\u043E\u043D\u043D\u043E \u0432 \u0446\u044F\u043B\u0430 \u0415\u0432\u0440\u043E\u043F\u0430 \u0438 \u0441\u0432\u0435\u0442\u0430."],
            ["\u041A\u0430\u043A\u0432\u043E \u0435 Nexus Dominion?", "\u0421\u0440\u0435\u0434\u043D\u043E\u0432\u0435\u043A\u043E\u0432\u043D\u043E dark fantasy \u0431\u0440\u0430\u0443\u0437\u044A\u0440 MMO, \u0438\u0437\u0433\u0440\u0430\u0434\u0435\u043D\u043E \u0441 React, Vite, Node.js, TypeScript, Prisma, PostgreSQL, Redis, Socket.IO \u0438 Docker. \u0412\u043A\u043B\u044E\u0447\u0432\u0430 52+ \u043C\u043E\u0434\u0435\u043B\u0430 \u0432 \u0431\u0430\u0437\u0430\u0442\u0430 \u0434\u0430\u043D\u043D\u0438, 27 \u0438\u0433\u0440\u043E\u0432\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0438 \u0438 PvP \u0431\u0438\u0442\u043A\u0438 \u0432 \u0440\u0435\u0430\u043B\u043D\u043E \u0432\u0440\u0435\u043C\u0435."],
            ["Carbon Stealth \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0432\u0430 \u043B\u0438 FiveM \u0440\u0435\u0441\u0443\u0440\u0441\u0438?", "\u0414\u0430. CS Anticheat v4.0 \u0438\u043C\u0430 40+ \u043C\u043E\u0434\u0443\u043B\u0430 \u0437\u0430 \u043E\u0442\u043A\u0440\u0438\u0432\u0430\u043D\u0435, \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u043D\u043E DMA \u043F\u043E\u0432\u0435\u0434\u0435\u043D\u0447\u0435\u0441\u043A\u043E \u043E\u0446\u0435\u043D\u044F\u0432\u0430\u043D\u0435. \u0421\u044A\u0449\u043E: \u043C\u0435\u0445\u0430\u043D\u0438\u0447\u043D\u0438 \u0442\u0430\u0431\u043B\u0435\u0442 \u0441\u0438\u0441\u0442\u0435\u043C\u0438, \u0431\u0430\u043D\u043A\u043E\u0432\u0438 \u043E\u0431\u0438\u0440\u0438 \u0438 \u0441\u044A\u0441\u0442\u0435\u0437\u0430\u0442\u0435\u043B\u043D\u0438 \u0440\u0435\u0441\u0443\u0440\u0441\u0438. \u041F\u043E\u0434\u0434\u0440\u044A\u0436\u043A\u0430 \u043D\u0430 QBCore \u0438 ESX."],
            ["\u0421 \u043A\u0430\u043A\u0432\u0438 \u0432\u0433\u0440\u0430\u0434\u0435\u043D\u0438 \u0438 IoT \u0441\u0438\u0441\u0442\u0435\u043C\u0438 \u0440\u0430\u0431\u043E\u0442\u0438 Carbon Stealth?", "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u0435\u0440\u0438 \u0437\u0430 \u043F\u0435\u0449\u0438 Eurotherm EPC3004 \u0447\u0440\u0435\u0437 Modbus RTU/TCP, PLC WAGO PFC200 \u0441 CODESYS, \u043F\u043B\u0430\u0442\u043A\u0438 \u0437\u0430 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0430 \u0430\u0441\u0430\u043D\u0441\u044C\u043E\u0440\u0438 \u0441\u044A\u0441 102 I/O \u0442\u043E\u0447\u043A\u0438 \u0438 14 \u0441\u044A\u0441\u0442\u043E\u044F\u043D\u0438\u044F, IoT \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430 Arduino/ESP32."],
            ["\u041A\u0430\u043A\u044A\u0432 \u0435 \u0442\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0438\u0447\u043D\u0438\u044F\u0442 \u0441\u0442\u0435\u043A?", "React, Node.js, TypeScript, Python, Prisma ORM, PostgreSQL, Redis, Docker, Nginx, Three.js, WebGL, GSAP, Socket.IO. \u0418\u043D\u0444\u0440\u0430\u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430: Hetzner VPS, Ubuntu 24.04, Let's Encrypt SSL."],
          ],
        }[lang] || []).map(function(pair, i) {
          return <div key={i} itemScope itemProp="mainEntity" itemType="https://schema.org/Question" style={{borderBottom:"1px solid rgba(245,245,240,.08)",padding:"20px 0"}}>
            <h3 itemProp="name" style={{fontFamily:HEAD,fontWeight:700,fontSize:"1rem",textTransform:"uppercase",letterSpacing:"-.01em",marginBottom:8,color:"#f5f5f0",textShadow:"0 1px 10px rgba(0,0,0,0.5)"}}>{pair[0]}</h3>
            <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
              <p itemProp="text" className="about-answer" style={{fontSize:11,lineHeight:1.9,color:"#ccc",maxWidth:600}}>{pair[1]}</p>
            </div>
          </div>;
        })}
      </section>

      </main>
      {/* ═══════════════════════════════════════════════════
          FULL FOOTER — from carbonstealth.eu
          ═══════════════════════════════════════════════════ */}
      <footer id="footer" style={{borderTop:"1px solid rgba("+CR+",.08)",position:"relative",zIndex:5,background:"rgba(0,0,0,.5)"}}>

        {/* TOP FOOTER — 4 columns */}
        <div style={{padding:"60px 20px 40px",display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr 1fr",gap:40,borderBottom:"1px solid rgba(245,245,240,.08)"}}>

          {/* Brand column */}
          <div>
            <div style={{marginBottom:16}}>
              <img src="/logo.png" alt="Carbon Stealth VCC" style={{height:40,objectFit:"contain",filter:"drop-shadow(0 0 8px rgba(0,229,255,0.25))"}}/>
            </div>
            <p style={{fontSize:10,lineHeight:1.9,color:"#ddd",maxWidth:280,marginBottom:16}}>{t("ft_desc")}</p>
            <div style={{display:"flex",gap:10}}>
              <a href="https://wa.me/393792969699" style={{width:32,height:32,border:"1px solid rgba(245,245,240,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"crosshair"}} title="WhatsApp">WA</a>
              <a href="mailto:info@carbonstealth.eu" style={{width:32,height:32,border:"1px solid rgba(245,245,240,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"crosshair"}} title="Email">EM</a>
              <a href="https://www.linkedin.com/company/carbonstealth.vcc" style={{width:32,height:32,border:"1px solid rgba(245,245,240,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,letterSpacing:".1em",cursor:"crosshair"}} title="LinkedIn">LI</a>
            </div>
          </div>

          {/* Servizi column */}
          <div>
            <div style={{fontSize:9,letterSpacing:".3em",color:C,marginBottom:16,fontWeight:700}}>{t("ft_servizi")}</div>
            {({it:[
              ["Sviluppo Siti Web","services"],["E-Commerce","services"],["Software Custom","services"],["ERP Professionale","services"],["App Mobile","services"],["SEO / GEO / AEO","services"],["Hosting Cloud","services"],["Game Cheat Checker","https://ac.carbonstealth.eu"],["Cybersecurity","services"]
            ],en:[
              ["Web Development","services"],["E-Commerce","services"],["Custom Software","services"],["Professional ERP","services"],["Mobile Apps","services"],["SEO / GEO / AEO","services"],["Cloud Hosting","services"],["Game Cheat Checker","https://ac.carbonstealth.eu"],["Cybersecurity","services"]
            ],bg:[
              ["\u0423\u0435\u0431 \u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430","services"],["\u0415\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u0430 \u0422\u044A\u0440\u0433\u043E\u0432\u0438\u044F","services"],["\u0421\u043E\u0444\u0442\u0443\u0435\u0440 \u043F\u043E \u041F\u043E\u0440\u044A\u0447\u043A\u0430","services"],["\u041F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D ERP","services"],["\u041C\u043E\u0431\u0438\u043B\u043D\u0438 \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F","services"],["SEO / GEO / AEO","services"],["\u0425\u043E\u0441\u0442\u0438\u043D\u0433","services"],["Game Cheat Checker","https://ac.carbonstealth.eu"],["\u041A\u0438\u0431\u0435\u0440\u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442","services"]
            ]}[lang]||[]).map(function(s){
              return s[1].startsWith("http")?<a key={s[0]} href={s[1]} target="_blank" rel="noopener" style={{display:"block",fontSize:10,color:"#ccc",lineHeight:2.2,cursor:"crosshair",textDecoration:"none"}}>{s[0]}</a>:<div key={s[0]} onClick={function(){scrollToId(s[1])}} style={{display:"block",fontSize:10,color:"#ccc",lineHeight:2.2,cursor:"crosshair"}}>{s[0]}</div>;
            })}
          </div>

          {/* Azienda column */}
          <div>
            <div style={{fontSize:9,letterSpacing:".3em",color:C,marginBottom:16,fontWeight:700}}>{t("ft_azienda")}</div>
            {({it:[
              ["Chi Siamo","about"],["Portfolio","portfolio"],["Blog & Risorse","faq"],["Case Study","portfolio"],["Carriere","contact"],["Contatti","contact"]
            ],en:[
              ["About Us","about"],["Portfolio","portfolio"],["Blog & Resources","faq"],["Case Studies","portfolio"],["Careers","contact"],["Contact","contact"]
            ],bg:[
              ["\u0417\u0430 \u041D\u0430\u0441","about"],["\u041F\u043E\u0440\u0442\u0444\u043E\u043B\u0438\u043E","portfolio"],["\u0411\u043B\u043E\u0433 \u0438 \u0420\u0435\u0441\u0443\u0440\u0441\u0438","faq"],["\u041F\u0440\u0438\u043C\u0435\u0440\u043D\u0438 \u041F\u0440\u043E\u0435\u043A\u0442\u0438","portfolio"],["\u041A\u0430\u0440\u0438\u0435\u0440\u0438","contact"],["\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438","contact"]
            ]}[lang]||[]).map(function(s){
              return <div key={s[0]} onClick={function(){scrollToId(s[1])}} style={{display:"block",fontSize:10,color:"#ccc",lineHeight:2.2,cursor:"crosshair"}}>{s[0]}</div>;
            })}
          </div>

          {/* Legale column */}
          <div>
            <div style={{fontSize:9,letterSpacing:".3em",color:C,marginBottom:16,fontWeight:700}}>{t("ft_legale")}</div>
            {({it:[
              ["Informativa Privacy","/privacy/"],["Politica Cookie","/cookie/"],["Termini di Servizio","/termini/"],["Sitemap XML","/sitemap.xml"]
            ],en:[
              ["Privacy Policy","/en/privacy/"],["Cookie Policy","/en/cookie/"],["Terms of Service","/en/termini/"],["Sitemap XML","/sitemap.xml"]
            ],bg:[
              ["\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0437\u0430 \u041F\u043E\u0432\u0435\u0440\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442","/bg/privacy/"],["\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0437\u0430 \u0411\u0438\u0441\u043A\u0432\u0438\u0442\u043A\u0438","/bg/cookie/"],["\u041E\u0431\u0449\u0438 \u0423\u0441\u043B\u043E\u0432\u0438\u044F","/bg/termini/"],["Sitemap XML","/sitemap.xml"]
            ]}[lang]||[]).map(function(s){
              return <a key={s[0]} href={s[1]} style={{display:"block",fontSize:10,color:"#ccc",lineHeight:2.2,cursor:"crosshair",textDecoration:"none"}}>{s[0]}</a>;
            })}
            <div style={{marginTop:16,display:"flex",gap:12}}>
              <span style={{fontSize:8,color:"#ccc",letterSpacing:".15em"}}>SSL {lang==="it"?"PROTETTO":lang==="bg"?"\u0417\u0410\u0429\u0418\u0422\u0415\u041D":"SECURED"}</span>
              <span style={{fontSize:8,color:"#ccc",letterSpacing:".15em"}}>99.9% UPTIME</span>
            </div>
          </div>
        </div>

        {/* CONTACT BAR */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(245,245,240,.08)",display:"flex",flexWrap:"wrap",justifyContent:"center",gap:24,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#ccc",letterSpacing:".1em"}}>{lang==="it"?"Sede Legale:":lang==="bg"?"\u0421\u0435\u0434\u0430\u043B\u0438\u0449\u0435:":"Registered Office:"} ul. Samuil 3, Bobov Dol 2670, Bulgaria</span>
          <span style={{fontSize:9,color:"#ccc"}}>EIK BG208725180</span>
          <a href="tel:+393792969699" style={{fontSize:9,color:C,letterSpacing:".1em",cursor:"crosshair"}}>IT +39 379 296 9699</a>
          <a href="tel:+359877414874" style={{fontSize:9,color:C,letterSpacing:".1em",cursor:"crosshair"}}>BG +359 877 414 874</a>
          <a href="mailto:info@carbonstealth.eu" style={{fontSize:9,color:C,letterSpacing:".1em",cursor:"crosshair"}}>info@carbonstealth.eu</a>
        </div>

        {/* BOTTOM BAR */}
        <div style={{padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <span style={{fontSize:8,color:"#ccc",letterSpacing:".1em"}}>{"\u00a9"} 2025-2026 Carbon Stealth VCC {"\u00b7"} EIK BG208725180 {"\u00b7"} Bobov Dol, Bulgaria</span>
          <div style={{display:"flex",gap:16}}>
            <a href={lang==="bg"?"/bg/privacy/":lang==="en"?"/en/privacy/":"/privacy/"} target="_blank" rel="noopener" style={{fontSize:8,color:"#ccc",letterSpacing:".1em",cursor:"crosshair",textDecoration:"none"}}>{lang==="it"?"Privacy":lang==="bg"?"\u041F\u043E\u0432\u0435\u0440\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442":"Privacy"}</a>
            <a href={lang==="bg"?"/bg/cookie/":lang==="en"?"/en/cookie/":"/cookie/"} target="_blank" rel="noopener" style={{fontSize:8,color:"#ccc",letterSpacing:".1em",cursor:"crosshair",textDecoration:"none"}}>{lang==="it"?"Cookie":lang==="bg"?"\u0411\u0438\u0441\u043A\u0432\u0438\u0442\u043A\u0438":"Cookies"}</a>
            <a href={lang==="bg"?"/bg/termini/":lang==="en"?"/en/termini/":"/termini/"} target="_blank" rel="noopener" style={{fontSize:8,color:"#ccc",letterSpacing:".1em",cursor:"crosshair",textDecoration:"none"}}>{lang==="it"?"Termini":lang==="bg"?"\u0423\u0441\u043B\u043E\u0432\u0438\u044F":"Terms"}</a>
          </div>
        </div>

        {/* POWERED BY */}
        <div style={{padding:"10px 20px",textAlign:"center",borderTop:"1px solid rgba(245,245,240,.02)"}}>
          <span style={{fontSize:7,color:"#444",letterSpacing:".3em"}}>{lang==="it"?"CREATO E PROGETTATO DA CARBON STEALTH":lang==="bg"?"\u0421\u042A\u0417\u0414\u0410\u0414\u0415\u041D\u041E \u0418 \u041F\u0420\u041E\u0415\u041A\u0422\u0418\u0420\u0410\u041D\u041E \u041E\u0422 CARBON STEALTH":"CREATED AND DESIGNED BY CARBON STEALTH"} {"\u00b7"} THREE.JS {"\u00b7"} WEB AUDIO {"\u00b7"} WEBGL {"\u00b7"} CANVAS 2D</span>
        </div>
      </footer>

      {/* ═══ COOKIE CONSENT BANNER — GDPR ═══ */}
      {!cookieOk && <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:99999,background:"rgba(0,0,0,.97)",borderTop:"1px solid rgba("+CR+",.2)",padding:"16px 20px",display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"space-between",backdropFilter:"blur(8px)"}}>
        <div style={{flex:1,minWidth:280}}>
          <p style={{fontSize:10,color:"#ccc",lineHeight:1.7,margin:0}}>{t("cookie_text")} <a href={lang==="bg"?"/bg/cookie/":lang==="en"?"/en/cookie/":"/cookie/"} style={{color:C,textDecoration:"none"}}>{t("cookie_more")}</a></p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <div onClick={rejectCookies} style={{padding:"8px 20px",border:"1px solid rgba(245,245,240,.2)",color:"#ccc",fontSize:9,letterSpacing:".15em",cursor:"crosshair"}}>{t("cookie_reject")}</div>
          <div onClick={acceptCookies} style={{padding:"8px 20px",border:"1px solid rgba("+CR+",.4)",background:"rgba("+CR+",.1)",color:C,fontSize:9,letterSpacing:".15em",cursor:"crosshair"}}>{t("cookie_accept")}</div>
        </div>
      </div>}

    </div>);
}
