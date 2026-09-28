// English — Началната страница; order се ползва и от продуктите и контактите (шаблонът на имейла).

export default {
  hero: {
    kicker: 'Brackets & accessories for lifts and goods lifts',
    title: 'Patented brackets for guide rails and landing doors',
    lead: 'A perforated, hinged and slotted system for the adjustable fixing of counterweight guide rails and landing doors — designed to adapt to irregular, out-of-plumb masonry and walls with rebar. A utility model patent recognised by the Italian Ministry of Enterprises and Made in Italy.',
    chips: ['Made in Italy', 'Galvanised steel', 'Ambidextrous system', 'Patented'],
    ctaProducts: 'See products & prices',
    ctaCatalog: 'Download the catalogue (PDF)',
    cta3d: 'View in 3D',
    patentLabel: 'Utility model patent',
    numAbbr: 'No.',
    patentOffice: 'Ministry of Enterprises and Made in Italy — UIBM · filed 19 May 2023',
    visualAlt: '3D render of plate A 65 170 7 installed with bracket B 65 320',
  },
  viewer3d: {
    kicker: '3D view',
    title: 'The brackets in 3D, before you order',
    lead: 'All 48 catalogue items, modelled in galvanised sheet steel from the dimensions in mm: rotate them, switch between DX and SX, see them installed with their partner bracket and try the adjustment.',
    start: 'Start the 3D view',
    fullscreen: 'Open full screen',
    frameTitle: '3D view of the Panev brackets',
    posterAlt: '3D render of support SU 220 160 installed with guide bracket SG 80 150 and the guide rail',
    points: [
      '48 items from the 2026 catalogue',
      'DX and SX versions',
      'Installed with M10 bolts, with the adjustment',
      'HD photo to download',
    ],
  },
  stats: [
    { value: '± 8°', label: 'Angular adjustment' },
    { value: '45 – 255', label: 'Extension range (mm)' },
    { value: 'DX / SX', label: 'Ambidextrous brackets' },
    { value: '4 / 5', label: 'Sheet thickness (mm)' },
  ],
  problem: {
    kicker: 'The problem on site',
    title: 'Crooked walls, rebar, tight schedules',
    body1: 'Along the lift shaft, cast-in-place concrete often has protrusions and recesses that make precise mounting difficult. Traditional brackets cannot adapt, forcing the installer into on-site modifications that cost time and extra material.',
    body2: 'The Panev bracket joins a wall-fixing element and a component-support element through an articulated joint that sets the angle, locked by a clamping element. The stiffening ribs are widest right next to the joint — precisely the most stressed area in service.',
    toolsLabel: 'Three tools are enough',
    tools: ['Hammer drill', 'Spanners', 'Spirit level'],
    highlight: 'Maximum stiffness where it matters',
    highlightBody: 'Contiguous ribs, wider next to the articulated joint: the bracket is strongest exactly at its most stressed point.',
  },
  applications: {
    kicker: 'Fields of use',
    title: 'Three applications, one system',
    items: [
      {
        img: 'a-45-170-7_b-45-320',
        title: 'Landing door sill',
        body: 'Fixing and height adjustment of the landing door sill relative to the finished floor level of the landing.',
      },
      {
        img: 'a-65-170-7_b-65-320-sx',
        title: 'Car door operator',
        body: 'Mounting of the car door operator, with the bracket fixed to the shaft structure and to the car.',
      },
      {
        img: 'sd-220-200_sg-80-190',
        title: 'Counterweight guide rails',
        body: 'Fixing of the counterweight guide rails to the shaft masonry, with adjustable SU · SD · SC supports.',
      },
    ],
    ambi: 'Ambidextrous system. The stiffening rib can sit on the left or on the right: this lets you avoid rebar in concrete walls and drill in the most suitable spots, without moving the door components.',
  },
  featured: {
    kicker: 'Product families',
    title: 'From the price list: the most requested brackets',
    families: [
      {
        img: 'a-65-170-7_b-65-220',
        title: 'Landing door brackets — A / B series',
        body: 'Perforated plate + slotted bracket, ± 7° / ± 8° adjustment on out-of-plumb masonry.',
      },
      {
        img: 'su-220-180_sg-80-170',
        title: 'SU / SD supports + SG guide bracket',
        body: 'Universal or offset support with joining bracket, 45 – 215 mm extension range.',
      },
      {
        img: 'sc-80-220_sg-80-220',
        title: 'SC sliding supports + SG',
        body: 'For the widest ranges, up to 235 mm, 4 mm thickness.',
      },
      {
        img: 'sg-80-190',
        title: 'Fixed SG guide brackets',
        body: 'Widths 50 / 60 / 80 mm, lengths 130 – 220 mm, ready for direct pairing.',
      },
    ],
    fromPrice: 'from',
    vatNote: 'Prices excl. VAT',
    seeAll: 'Full price list with every code',
  },
  patent: {
    kicker: 'Industrial property',
    title: 'A patented system',
    body: 'The Panev Ascensori support bracket is protected by a utility model patent granted by the Italian Ministry of Enterprises and Made in Italy (UIBM). The title protects the adjustable fixing solution for structural components of lift and goods-lift installations.',
    conformity: 'Products compliant with UNI EN 81 (safety rules for lifts), steel compliant with UNI EN 10025, suitable for UNI 10411 inspection.',
    rows: [
      ['Number', 'No. 202023000002112'],
      ['Type', 'Utility model'],
      ['Classification', 'B66B'],
      ['Filed', '19 May 2023'],
      ['Granted', 'Rome, 7 January 2025'],
      ['Valid', 'until 19 May 2033'],
    ],
  },
  order: {
    kicker: 'How to order',
    title: 'Direct ordering by email',
    lead: 'No cart, no registration: pick the codes from the price list and send your order by email. We reply with an order confirmation or a quote.',
    steps: [
      {
        title: 'Pick the codes',
        body: 'Browse the price list or the PDF catalogue and note down code, quantity and — where applicable — the DX (right) or SX (left) hand.',
      },
      {
        title: 'Send the email',
        body: 'Write to info@panevascensori.it with the list of codes. The “Order by email” button pre-fills the message for you.',
      },
      {
        title: 'Get confirmation',
        body: 'We reply with availability, total and delivery times: standard 2 – 5 working days, express 24 – 48 h on request.',
      },
    ],
    freeShipping: 'Free shipping across Italy for orders above € 500 (excl.',
    b2b: 'VAT). B2B only, VAT number required. Electronic invoicing via SdI.',
    mailSubject: 'Bracket order — [company]',
    mailBody: 'Dear Panev Ascensori,\n\nwe would like to order the following items:\n\n- CODE — quantity — DX/SX hand (if applicable)\n\nCompany details (company name, VAT no., delivery address):\n\nKind regards',
  },
  faq: {
    kicker: 'Frequently asked questions',
    title: 'FAQ — orders, prices, shipping',
    items: [
      {
        q: 'How do I place an order?',
        a: 'By email to info@panevascensori.it: state the code, the quantity and — where applicable — the DX (right) or SX (left) hand. The “Order by email” button and the order list pre-fill the message for you. We reply with an order confirmation, total and delivery times.',
      },
      {
        q: 'Do prices include VAT?',
        a: 'No: all list prices are in euro, excluding VAT, per single unit (2026 price list). Sales are reserved to professional operators (B2B) with a VAT number; electronic invoicing via SdI.',
      },
      {
        q: 'How much is shipping and how long does delivery take?',
        a: 'Shipping is free across Italy for orders above € 500 (excl. VAT); below that threshold costs are stated in the order confirmation. Standard delivery takes 2 – 5 working days, express 24 – 48 hours on request.',
      },
      {
        q: 'What do DX and SX mean?',
        a: 'Every bracket is ambidextrous: DX is the right-hand version, SX the left-hand one. This lets you avoid rebar in concrete walls and drill in the most suitable spots. State the required hand when ordering.',
      },
      {
        q: 'Which series should I choose?',
        a: 'For landing door fixing: A / B series (37 / 45 / 65 mm sections, ± 7° / ± 8° adjustment). For counterweight guide rails: SU (universal), SD (offset) or SC (sliding) supports paired with the SG joining bracket, 45 – 235 mm range. For non-standard sizes: solutions to shop drawing, quoted on request.',
      },
      {
        q: 'Are the brackets standard-compliant and under warranty?',
        a: 'Yes: products comply with UNI EN 81, galvanised steel complies with UNI EN 10025, suitable for UNI 10411 inspection. The system is protected by utility model patent UIBM No. 202023000002112, valid until 2033. 2-year warranty on manufacturing defects.',
      },
    ],
  },
};
