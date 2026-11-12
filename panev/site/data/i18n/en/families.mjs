// English — family pages (URLs, meta, H1, answer-first lead, FAQ). Facts from the catalogue and
// ../../products.mjs only.

export default {
  familySlugs: {
    famDoors: 'landing-door-brackets.html',
    famGuides: 'counterweight-guide-rail-supports.html',
    famSg: 'sg-guide-brackets.html',
    famSpecial: 'custom-brackets.html',
  },
  familyMeta: {
    famDoors: {
      title: 'Landing door brackets for lifts, A/B series | Panev',
      description: 'Perforated, jointed landing door brackets: A plates and B brackets in 37/45/65 mm series, ±7°/±8° adjustment, left or right. Prices excl. VAT, order by email.',
      keywords: ['landing door brackets', 'lift landing door bracket', 'elevator door fixing bracket', 'adjustable lift brackets', 'A plate B bracket', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famGuides: {
      title: 'Counterweight guide rail supports SU SD SC | Panev',
      description: 'Adjustable supports for counterweight guide rails: SU universal, SD offset, SC sliding, each with an SG joining bracket. Range 45–235 mm, prices excl. VAT.',
      keywords: ['counterweight guide rail bracket', 'counterweight rail support', 'adjustable guide rail bracket', 'SU SD SC support', 'SG joining bracket', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famSg: {
      title: 'Fixed SG guide brackets for lifts | Panev',
      description: 'Fixed L-shaped SG guide brackets: widths 50/60/80 mm, lengths 130–220 mm, 4 mm sheet. 15 codes on the price list, excl. VAT, order by email.',
      keywords: ['SG guide brackets', 'lift guide rail bracket', 'L bracket lift', 'elevator rail bracket', 'fixed guide bracket', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famSpecial: {
      title: 'Custom lift brackets and wall fixing | Panev',
      description: 'To shop drawing: SC 50 170 support with projection A, SG 225 50 guide, SN brackets and an adjustable rigid arm for wall fixing. Quoted on request.',
      keywords: ['custom lift brackets', 'guide rail wall fixing', 'adjustable rigid arm', 'SN corner bracket', 'lift bracket to drawing', 'Panev Ascensori', 'Carbon Stealth'],
    },
  },
  families: {
    shared: {
      more: 'Dedicated page',
      familiesLabel: 'Bracket families',
      crumbsLabel: 'Breadcrumb',
      otherTitle: 'Other bracket families',
      fullList: 'Full price list with every code',
      see3d: 'View in 3D',
      catalogPages: (a, b) => `PDF catalogue · pp. ${a}–${b}`,
      altDoor: (serie, codes) => `Landing door bracket, ${serie} series: ${codes.join(' with ')}, 3D render`,
      altCfg: (sup, gui) => `${sup} support with ${gui} joining bracket for counterweight guide rails, 3D render`,
    },
    famDoors: {
      crumb: 'Landing door brackets',
      kicker: 'Landing door fixing · A / B series',
      h1: 'Landing door brackets for lifts: A / B series',
      lead: 'Perforated, jointed brackets to fix and align landing door components on any wall, even one that is not square: an A plate and a B bracket of the same section (37, 45 or 65 mm), ± 7° / ± 8° angular adjustment, right or left version.',
      faqTitle: 'Landing door brackets: FAQ',
      faq: [
        { q: 'What are Panev landing door brackets made of?', a: 'Two parts: the A plate, the perforated horizontal part, and the B bracket, the slotted vertical part, of the same section (37, 45 or 65 mm). Angular adjustment is ± 8° on the 65 series and ± 7° on the 45 and 37 series; the sheet is 5 mm (65 and 45 series) or 4 mm (37 series).' },
        { q: 'Can I combine plates and brackets of different series?', a: 'No: the A plate fits only B brackets of the same section. The 37 / 45 / 65 series are not interchangeable.' },
        { q: 'Are the brackets right- or left-handed?', a: 'They are ambidextrous: available as a right-hand (DX) and a left-hand (SX) version. State the hand you need when you order.' },
      ],
    },
    famGuides: {
      crumb: 'Counterweight guide rail supports',
      kicker: 'Counterweight guide rail fixing · SU · SD · SC + SG',
      h1: 'Adjustable brackets and supports for counterweight guide rails',
      lead: 'Three adjustable supports to fix and align counterweight guide rails, always with the SG joining bracket: SU universal, SD with an offset base for irregular walls and SC sliding for the widest ranges. Extension range from 45 to 235 mm, 35 mm overlap flap.',
      faqTitle: 'Counterweight guide rail supports: FAQ',
      faq: [
        { q: 'What is the difference between SU, SD and SC supports?', a: 'SU is the universal support and SD the one with an offset base, for more freedom of positioning on irregular walls: both in 5 mm sheet, range up to 215 mm. SC is the sliding support, in 4 mm sheet, for the widest extension ranges, up to 235 mm.' },
        { q: 'What do I order for one configuration?', a: 'Two codes: the support (SU, SD or SC) and the SG joining bracket listed for that configuration, for example SU 220 160 with SG 80 150. Both are on the price list with their own price, excl. VAT.' },
        { q: 'How is the wall-to-rail distance adjusted?', a: 'The joining bracket slides on the support within the extension range given for each configuration — for example 45 – 155 mm for SU 220 160 with SG 80 150 — with a 35 mm overlap flap.' },
      ],
    },
    famSg: {
      crumb: 'SG guide brackets',
      kicker: 'Standard guide brackets · fixed version',
      h1: 'Fixed SG guide brackets for lifts',
      visualAlt: 'Fixed SG 80 190 guide bracket, 3D render',
      lead: 'Fixed L-shaped guide brackets in 4 mm sheet: three widths (50, 60 and 80 mm) and five lengths (130 to 220 mm), 15 codes on the price list, ready to combine with SU, SD, SC supports or with the rigid arm wall fixing.',
      faqTitle: 'SG guide brackets: FAQ',
      faq: [
        { q: 'Which sizes are available?', a: 'Widths 50, 60 and 80 mm and lengths 130, 150, 170, 190 and 220 mm: 15 codes, all in 4 mm sheet, priced on the list excl. VAT.' },
        { q: 'How do I read an SG code?', a: 'SG is the joining bracket between support and counterweight guide rail; the first number is the width and the second the length in millimetres. SG 80 150 = 80 mm wide, 150 mm long.' },
        { q: 'What do they combine with?', a: 'With the adjustable SU, SD and SC supports, or with wall fixing through the adjustable rigid arm.' },
      ],
    },
    famSpecial: {
      crumb: 'Custom brackets',
      kicker: 'Special and custom solutions',
      h1: 'Custom brackets and wall fixing with a rigid arm',
      visualAlt: 'BRACCIO 160 190 adjustable rigid arm for wall fixing, 3D render',
      lead: 'For non-standard installations: the SC 50 170 support, whose projection “A” is set on the site’s shop drawing, the modular SG 225 50 guide and wall fixing with the SN 60 65 corner bracket, the SN 65 200 square bracket and the BRACCIO 160 190 adjustable rigid arm. Quoted on request.',
      faqTitle: 'Custom brackets: FAQ',
      faq: [
        { q: 'When are custom solutions needed?', a: 'For non-standard mounting conditions: the projection “A” of the SC 50 170 support is defined on the site’s shop drawing; the SG 225 50 guide is modular (150 + 30 mm, 5 mm sheet).' },
        { q: 'What is wall fixing with a rigid arm?', a: 'An anchoring solution for SG guide brackets combined with an SC support through an adjustable rigid arm, for fixing directly to the corner walls of the shaft. It comprises the SN 60 65 corner bracket, the SN 65 200 square bracket and the BRACCIO 160 190.' },
        { q: 'How do I get a price?', a: 'Special solutions are quoted on request: send the drawing or the measurements to info@panevascensori.it and receive a quote for the job.' },
      ],
    },
  },
};
