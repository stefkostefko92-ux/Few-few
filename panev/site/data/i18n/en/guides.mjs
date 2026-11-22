// English — The two in-depth pages: the patent and fixing to uneven walls.
// The facts are the catalogue's (pp. 02, 03, 04, 08, 10, 66) and ../../products.mjs: nothing new.

export default {
  guideSlugs: {
    patent: 'patent.html',
    walls: 'brackets-for-uneven-walls.html',
  },
  guideMeta: {
    patent: {
      title: 'Lift bracket patent: Italian utility model | Panev',
      description: 'Panev brackets are protected by Italian utility model patent No. 202023000002112 (UIBM): filed 19 May 2023, granted 7 January 2025, valid until 2033.',
      keywords: ['lift bracket patent', 'lift bracket utility model', 'utility model 202023000002112', 'patented lift support bracket', 'UIBM patent lift brackets', 'Panev patent', 'Panev Ascensori', 'Carbon Stealth'],
    },
    walls: {
      title: 'Lift brackets for uneven and out-of-square walls | Panev',
      description: 'Fixing counterweight guide rails and landing doors to uneven or out-of-square walls: articulated joint, extension range, mounting in six steps.',
      keywords: ['lift brackets for uneven walls', 'guide rail brackets irregular masonry', 'adjustable lift brackets out-of-plumb wall', 'lift bracket installation', 'landing door fixing uneven wall', 'Panev Ascensori', 'Carbon Stealth'],
    },
  },
  guides: {
    shared: {
      crumbsLabel: 'Breadcrumb',
      relatedTitle: 'The bracket families',
      relatedLabel: 'Bracket families',
      catalogPage: (n) => `PDF catalogue · p. ${String(n).padStart(2, '0')}`,
    },
    patent: {
      crumb: 'Patent',
      link: 'The Panev lift bracket patent',
      kicker: 'Industrial property · Utility model',
      h1: 'The Panev lift bracket patent: utility model No. 202023000002112',
      lead: 'Yes, Panev brackets are patented: the support bracket is protected by utility model patent No. 202023000002112, granted by the Italian Ministry of Enterprises and Made in Italy (UIBM) on 7 January 2025 and valid until 19 May 2033.',
      visualAlt: 'Patented landing door bracket, A 65 170 7 plate with B 65 320 bracket, 3D render',
      factsTitle: 'Patent details',
      titleRow: ['Title', 'Staffa di supporto per un componente strutturale di un impianto di ascensore o montacarichi (support bracket for a structural component of a lift or goods-lift installation)'],
      officeRow: ['Office', 'Italian Ministry of Enterprises and Made in Italy — UIBM'],
      scopeTitle: 'What it protects',
      anatomyTitle: 'How the patented bracket is built',
      anatomyLead: 'The parts of the system, as the patent describes them.',
      anatomy: [
        ['Fixing element', 'Fixed to the masonry of the lift shaft.'],
        ['Support element', 'Carries the structural component, at right angles to the fixing element.'],
        ['Articulated joint', 'Sets the angle between fixing and support.'],
        ['Clamping element', 'Locks the angle once it is set.'],
        ['Stiffening ribs', 'Folded edges, wider next to the joint.'],
        ['Slotted fixing holes', 'Slots parallel to the edge, for fixing to the wall.'],
        ['Connection holes', 'To fix the component to the support element.'],
      ],
      whereTitle: 'Where to find the patented system',
      whereLead: 'The system is presented in the 2026 technical catalogue, with the certificate on page 02, and on the price list in the bracket families.',
      wallsLink: 'How it is mounted on uneven walls',
      faqTitle: 'Patent: FAQ',
      faq: [
        { q: 'Are Panev brackets patented?', a: 'Yes. The Panev Ascensori support bracket is protected by utility model patent No. 202023000002112, granted in Rome on 7 January 2025 by the Italian Ministry of Enterprises and Made in Italy (UIBM).' },
        { q: 'How long is the patent valid?', a: 'Until 19 May 2033. The application was filed on 19 May 2023.' },
        { q: 'What does the patent protect?', a: 'It protects the adjustable fixing solution presented in the catalogue: a wall-fixing element and a support element joined by an articulated joint, with a clamping element that locks the angle once it is set. Its title is “Staffa di supporto per un componente strutturale di un impianto di ascensore o montacarichi” — support bracket for a structural component of a lift or goods-lift installation (classification B66B).' },
        { q: 'Where can the patent be checked?', a: 'In the registers of the Italian Patent and Trademark Office (UIBM), under number 202023000002112. The certificate is reproduced on page 02 of the technical catalogue.' },
      ],
    },
    walls: {
      crumb: 'Uneven walls',
      kicker: 'Solutions · masonry or concrete lift shafts',
      h1: 'Fixing guide rails and landing doors to uneven shaft walls',
      lead: 'On irregular or out-of-square walls Panev brackets are adjusted on site: the articulated joint takes up the angle (± 7° / ± 8° for landing doors), the slotted holes let the fixing move, and the SG joining bracket slides on its support to cover the distance between wall and guide rail.',
      problemTitle: 'The problem on site',
      problem: [
        'Along the lift shaft, cast-in-place concrete often has protrusions and recesses, and the wall is not always square to the component to be fixed. Traditional brackets do not adapt easily, forcing the installer into on-site modifications.',
        'The Panev system is perforated, hinged and slotted: designed to adapt to irregular, out-of-plumb masonry and walls with rebar.',
      ],
      tableTitle: 'Which adjustment for which wall',
      tableHead: ['Condition on site', 'How it is taken up', 'System'],
      // [condition, how it is taken up, system, family page]
      rows: [
        ['Wall not square to the landing door', 'Articulated joint: angular adjustment of ± 8° (65 series) or ± 7° (45 and 37 series)', 'A plate + B bracket', 'famDoors'],
        ['Varying distance between wall and counterweight guide rail', 'The SG joining bracket slides on the support within the extension range of the configuration, for example 45 – 155 mm for SU 220 160 with SG 80 150', 'SU or SC support + SG', 'famGuides'],
        ['Irregular wall, fixing to be moved off-centre', 'Offset base, for more freedom of positioning', 'SD support + SG', 'famGuides'],
        ['Corner walls of the shaft', 'Fixing directly to the wall with an adjustable rigid arm', 'SN 60 65, SN 65 200 and BRACCIO 160 190', 'famSpecial'],
        ['Projection outside the standard sizes', 'Projection “A” defined on the site’s shop drawing', 'SC 50 170 support', 'famSpecial'],
      ],
      stepsTitle: 'Mounting in six steps',
      stepsLead: 'The articulated bracket is installed with three tools: a hammer drill, spanners and a spirit level.',
      howToName: 'Mounting a Panev articulated bracket on an uneven wall',
      steps: [
        { title: 'Marking and drilling', body: 'Mark the position on the wall and drill with the hammer drill, using the slotted holes of the fixing element.' },
        { title: 'Fixing to the wall', body: 'Fix the fixing element with the anchors and, before tightening, check with the spirit level that it is vertical.' },
        { title: 'Setting the angle', body: 'Turn the support element about the articulated joint to take up walls that protrude or recede.' },
        { title: 'Locking', body: 'Tighten the clamping element in the slot to lock the set angle permanently.' },
        { title: 'Adjusting and cutting', body: 'Adjust the lengthwise position of the support and, if necessary, cut it to size as the mounting requires.' },
        { title: 'Fixing the component', body: 'Connect the component — sill, door operator or guide rail — to the connection holes and check the final alignment with the spirit level.' },
      ],
      stepsNote: 'The installation drawings for every system are in the technical catalogue.',
      patentLink: 'The system is patented: patent details',
      faqTitle: 'Uneven walls: FAQ',
      faq: [
        { q: 'How are counterweight guide rails fixed to irregular walls?', a: 'With an adjustable support (SU, SD or SC) and the SG joining bracket: the support is fixed to the wall and the joining bracket slides on it within the extension range given for each configuration, with a 35 mm overlap flap. The SD support has an offset base, for more freedom of positioning on irregular walls.' },
        { q: 'How is a wall that is not square to the landing door taken up?', a: 'With the articulated joint of the landing door brackets: the support element turns relative to the one fixed to the wall, by ± 8° on the 65 series and ± 7° on the 45 and 37 series, and a clamping element locks the angle once it is set.' },
        { q: 'Which tools are needed for mounting?', a: 'Three: a hammer drill, spanners and a spirit level.' },
        { q: 'What if the size I need is not on the price list?', a: 'It is made to order: the projection “A” of the SC 50 170 support is defined on the site’s shop drawing. Send the drawing or the measurements to info@panevascensori.it and receive a quote for the job.' },
      ],
    },
  },
};
