// Сцените на клипа (promo/README.md) — 104 BPM, 43 такта. Всеки преход пада на удар в музиката
// (promo/music.py ползва същата мрежа). Факти само от продукта: предстоящото е „предстои“.
const STAGE = document.getElementById('scenes');
const W = 1920;
const H = 1080;
const END = at(43) + 1.4;
window.DURATION = END;

const scenes = [];
function scene(from, to, build) {
  const root = el('div', 'scene', STAGE);
  const draw = build(root);
  scenes.push({ a: at(from), b: at(to), root, draw });
}
const URL_BASE = 'fakturist.carbonstealth.eu';
const ORG = 'app/o/pekarna-zora';

// ── 1. Лого и обещанието ─────────────────────────────────────────────────────────────────────────
scene(0, 4, (root) => {
  const mark = el('img', 'logo', root);
  mark.src = '/brand/mark.png';
  const word = el('img', 'logo', root);
  word.src = '/brand/wordmark.png';
  const sweepBox = el('div', 'logo', root);
  sweepBox.style.overflow = 'hidden';
  const sweep = el('div', 'sweep', sweepBox);
  const line = kinetic(
    root,
    'Фактури по ЗДДС, записани\nи като *структуриран* *XML.*',
    'h2',
    0,
    610,
    { w: W, align: 'center' },
  );
  const pills = el('div', '', root);
  place(pills, 0, 820, W);
  pills.style.cssText += 'display:flex;justify-content:center;gap:18px;position:absolute;';
  const tags = ['EN 16931', 'UBL 2.1', 'CII'].map((s) => el('span', 'pill mono', pills, s));
  return (t) => {
    // Знакът се завърта в 3D и каца; надписът излиза отляво от него.
    const p = ease.outExpo(seg(t, 0.25, 2.0));
    const markH = 210;
    const markW = markH * window.BRAND.markRatio;
    const wordH = markH * 0.62;
    const wordW = wordH * window.BRAND.wordRatio;
    const total = markW + 40 + wordW;
    const reveal = ease.inOutQuint(seg(t, at(1, 0), at(1, 3)));
    const x0 = lerp(W / 2 - markW / 2, W / 2 - total / 2, reveal);
    const y0 = lerp(330, 250, ease.inOut(seg(t, at(1, 2), at(2, 1))));
    place(mark, x0, y0, markW, markH);
    mark.style.opacity = p.toFixed(3);
    mark.style.transform = `perspective(1200px) rotateY(${((1 - p) * -95).toFixed(2)}deg) scale(${lerp(0.6, 1, p).toFixed(3)})`;
    mark.style.filter = `drop-shadow(0 0 ${(40 * p).toFixed(0)}px rgba(44,197,181,${(0.45 * p).toFixed(2)}))`;
    place(word, x0 + markW + 40, y0 + (markH - wordH) / 2, wordW, wordH);
    word.style.clipPath = `inset(0 ${((1 - reveal) * 100).toFixed(2)}% 0 0)`;
    word.style.transform = `translateX(${((1 - reveal) * -60).toFixed(1)}px)`;
    place(sweepBox, x0, y0, total, markH);
    sweep.style.transform = `translateX(${lerp(-110, 110, seg(t, at(2, 0), at(2, 3))).toFixed(1)}%)`;
    sweep.style.opacity = seg(t, at(2, 0), at(2, 0.4)) * (1 - seg(t, at(2, 2.6), at(2, 3)));
    sweepBox.style.webkitMaskImage = 'url(/brand/logo-light.png)';
    sweepBox.style.webkitMaskSize = '100% 100%';
    line.draw(t, at(2, 0.5), at(3, 3.4));
    tags.forEach((tag, i) => {
      const q = ease.outBack(seg(t, at(3, 0) + i * 0.12, at(3, 0) + i * 0.12 + 0.6));
      tag.style.opacity = clamp(q).toFixed(3) * (1 - seg(t, at(3, 3.2), at(3, 3.7)));
      tag.style.transform = `translateY(${((1 - q) * 30).toFixed(1)}px)`;
    });
  };
});

// ── 2. Защо сега: е-фактурите по законопроекта ───────────────────────────────────────────────────
scene(4, 8, (root) => {
  const note = kinetic(root, 'Според внесения законопроект № 52-602-01-60', 'small', 140, 250);
  const date = kinetic(root, '*01.07.2028*', 'h1 mono', 140, 300);
  date.node.style.fontSize = '150px';
  const line1 = kinetic(root, 'е-фактурите между фирмите\nстават *задължителни.*', 'h2', 140, 490, {
    w: 1000,
  });
  const line2 = kinetic(
    root,
    'Фактурата става *данни* —\nUBL 2.1 или CII по EN 16931.',
    'h3',
    140,
    680,
    { w: 1000 },
  );
  line2.node.style.color = 'var(--ink-2)';
  const code = el('div', 'code', root);
  place(code, 1180, 230, 640, 600);
  const rows = [
    [
      '<span class="bt">BT-1 </span>',
      '&lt;<span class="tg">cbc:ID</span>&gt;<span class="vl">0000000004</span>&lt;/<span class="tg">cbc:ID</span>&gt;',
    ],
    [
      '<span class="bt">BT-2 </span>',
      '&lt;<span class="tg">cbc:IssueDate</span>&gt;<span class="vl">2026-11-15</span>&lt;/…&gt;',
    ],
    [
      '<span class="bt">BT-3 </span>',
      '&lt;<span class="tg">cbc:InvoiceTypeCode</span>&gt;<span class="vl">380</span>&lt;/…&gt;',
    ],
    [
      '<span class="bt">BT-5 </span>',
      '&lt;<span class="tg">cbc:DocumentCurrencyCode</span>&gt;<span class="vl">EUR</span>…',
    ],
    [
      '<span class="bt">BT-48</span>',
      '&lt;<span class="tg">cbc:CompanyID</span>&gt;<span class="vl">BG556677881</span>…',
    ],
    [
      '<span class="bt">BT-110</span>',
      '&lt;<span class="tg">cbc:TaxAmount</span> <span class="at">currencyID</span>=<span class="vl">"EUR"</span>&gt;<span class="vl">56.20</span>…',
    ],
    [
      '<span class="bt">BT-115</span>',
      '&lt;<span class="tg">cbc:PayableAmount</span>&gt;<span class="vl">337.20</span>…',
    ],
  ];
  const lines = rows.map(([a, b]) => el('span', 'ln', code, `${a}  ${b}`));
  return (t) => {
    note.draw(t, at(4, 0.2), at(7, 3.2), 0.03);
    date.draw(t, at(4, 1), at(7, 3.2));
    line1.draw(t, at(4, 3), at(7, 3.3), 0.05);
    line2.draw(t, at(6, 0), at(7, 3.4), 0.05);
    const c = ease.outExpo(seg(t, at(5, 0), at(5, 2)));
    code.style.opacity = (c * (1 - seg(t, at(7, 3), at(7, 3.6)))).toFixed(3);
    code.style.transform = `perspective(1400px) rotateY(${lerp(-28, -12, c).toFixed(2)}deg) translateX(${((1 - c) * 80).toFixed(1)}px)`;
    lines.forEach((ln, i) => {
      const q = ease.out(seg(t, at(5, 1) + i * BEAT * 0.5, at(5, 1) + i * BEAT * 0.5 + 0.4));
      ln.style.opacity = q.toFixed(3);
      ln.style.transform = `translateX(${((1 - q) * 24).toFixed(1)}px)`;
    });
  };
});

// ── 3. PDF за хората, XML за програмите ──────────────────────────────────────────────────────────
scene(8, 12, (root) => {
  const title = kinetic(root, 'Фактурист го прави *още днес.*', 'h2', 0, 110, {
    w: W,
    align: 'center',
  });
  const sheet = el('div', 'sheet', root);
  place(sheet, 230, 280, 620, 0);
  const sheetImg = el('img', '', sheet);
  sheetImg.src = '/shots/invoice.png';
  sheet.style.height = '620px';
  const code = el('div', 'code', root);
  place(code, 1030, 290, 700, 590);
  code.style.fontSize = '17px';
  code.innerHTML = window.XML.map((l) => `<span class="ln">${l}</span>`).join('');
  const capA = kinetic(root, 'PDF — за хората', 'h3', 230, 935, { w: 620, align: 'center' });
  const capB = kinetic(root, 'XML — за програмите', 'h3', 1030, 935, { w: 700, align: 'center' });
  const free = el('div', 'pill solo', root, 'И в безплатния план');
  place(free, 0, 188);
  return (t) => {
    title.draw(t, at(8, 0.2), at(11, 3.3));
    const a = ease.outExpo(seg(t, at(8, 1), at(9, 1)));
    const drift = Math.sin((t - at(8)) * 0.6) * 4;
    sheet.style.opacity = (a * (1 - seg(t, at(11, 3), at(11, 3.6)))).toFixed(3);
    sheet.style.transform = `perspective(1600px) rotateY(${lerp(40, 14 + drift, a).toFixed(2)}deg) rotateX(${(4 + drift * 0.3).toFixed(2)}deg) translateY(${((1 - a) * 120).toFixed(1)}px)`;
    const b = ease.outExpo(seg(t, at(9, 0), at(10, 0)));
    code.style.opacity = (b * (1 - seg(t, at(11, 3), at(11, 3.6)))).toFixed(3);
    code.style.transform = `perspective(1600px) rotateY(${lerp(-40, -12 - drift, b).toFixed(2)}deg) translateY(${((1 - b) * 120).toFixed(1)}px)`;
    code.scrollTop = 0;
    const scroll = ease.inOut(seg(t, at(10, 0), at(11, 2))) * 260;
    code.style.setProperty('--scroll', `${scroll}px`);
    code.querySelectorAll('.ln').forEach((ln) => (ln.style.transform = `translateY(${-scroll}px)`));
    capA.draw(t, at(9, 2), at(11, 3.3));
    capB.draw(t, at(10, 0), at(11, 3.3));
    const f = ease.outBack(seg(t, at(10, 2), at(11, 0)));
    free.style.left = `${W / 2 - free.offsetWidth / 2}px`;
    free.style.opacity = (clamp(f) * (1 - seg(t, at(11, 3), at(11, 3.6)))).toFixed(3);
    free.style.transform = `scale(${lerp(0.7, 1, clamp(f)).toFixed(3)})`;
  };
});

// ── 4. Нов документ — поле по поле, проверка по ЗДДС ─────────────────────────────────────────────
scene(12, 18, (root) => {
  const bw = browserWindow(root, 'new', `${URL_BASE}/${ORG}/nov`, 1240, 880);
  place(bw.win, 60, 140);
  const shot = window.SHOTS['new-filled'];
  const r = shot.rects;
  const fields = [
    'buyerName',
    'buyerStreet',
    'buyerEik',
    'buyerVat',
    'buyerCity',
    'buyerPc',
    'line0name',
    'line0qty',
    'line0price',
    'line1name',
    'line1qty',
    'line1price',
  ];
  const typers = fields
    .filter((f) => r[f])
    .map((f) => ({ f, ty: typing(bw.layers.cam, '/shots/new-filled.png', shot, r[f]) }));
  const hlIssue = highlight(bw.layers.cam, r.issue, 10);
  const cur = cursor(root);
  const cap = kinetic(root, 'Нов документ —\nполе по поле.', 'h2', 1360, 190, { w: 520 });
  const sub = kinetic(
    root,
    'Контрагентите и артикулите\nсе попълват от каталога.',
    'sub',
    1360,
    360,
    { w: 520 },
  );
  const checksTitle = kinetic(
    root,
    'Проверка по ЗДДС,\nпреди документът да излезе',
    'h3',
    1360,
    520,
    { w: 540 },
  );
  const checks = el('div', '', root);
  place(checks, 1360, 660, 520);
  checks.style.position = 'absolute';
  const items = [
    'Десетразреден номер без пропуски',
    'ЕИК и ДДС номер с контролна цифра',
    'Основание при нулева ставка',
    'ДДС и в евро при чужда валута',
  ].map((s) => {
    const row = el('div', 'check', checks, `<i>${ICONS.check}</i><span>${s}</span>`);
    row.style.fontSize = '25px';
    return row;
  });
  const union = (keys) => {
    const rs = keys.map((k) => r[k]).filter(Boolean);
    const x = Math.min(...rs.map((q) => q[0]));
    const y = Math.min(...rs.map((q) => q[1]));
    return [
      x,
      y,
      Math.max(...rs.map((q) => q[0] + q[2])) - x,
      Math.max(...rs.map((q) => q[1] + q[3])) - y,
    ];
  };
  const pad = ([x, y, w, h], px, py) => [x - px, y - py, w + 2 * px, h + 2 * py];
  const left = pad(union(['buyerName', 'buyerStreet']), 30, 46);
  const right = pad(union(['buyerEik', 'buyerVat', 'buyerPc']), 30, 46);
  const lines = pad(union(['line0name', 'line1price']), 40, 60);
  const head = [0, 0, 1440, 900];
  const T0 = at(12);
  const typeAt = {};
  let tt = at(13, 1);
  for (const { f } of typers) {
    const len = f.endsWith('name') || f === 'buyerStreet' ? 0.6 : 0.33;
    typeAt[f] = [tt, tt + len];
    // Паузите — докато камерата се мести: от лявата колона към дясната и към редовете.
    tt += len + (f === 'buyerStreet' ? 0.55 : f === 'buyerPc' ? 1.0 : 0.08);
  }
  const issueT = at(17, 0);
  return (t) => {
    const winIn = ease.outExpo(seg(t, T0 + 0.1, T0 + 1.4));
    // Излизане преди следващата сцена — двата прозореца не се застъпват.
    const winOut = ease.in(seg(t, at(17, 2.6), at(17, 3.7)));
    bw.win.style.opacity = (Math.min(1, winIn * 1.4) * (1 - winOut)).toFixed(3);
    bw.win.style.transform = `perspective(2200px) rotateY(${lerp(14, 4, winIn).toFixed(2)}deg) rotateX(${lerp(8, 2, winIn).toFixed(2)}deg) translateY(${((1 - winIn) * 120).toFixed(1)}px) translateX(${(-winOut * 160).toFixed(1)}px) scale(${lerp(1, 0.94, winOut).toFixed(3)})`;
    const c = bw.camera(t, [
      [T0, head, 1],
      [at(13, 0), left, 0.92],
      [typeAt.buyerStreet[1] + 0.05, left, 0.92],
      [typeAt.buyerEik[0] - 0.05, right, 0.92],
      [typeAt.buyerPc[1] + 0.05, right, 0.92],
      [typeAt.line0name[0] - 0.05, lines, 0.9],
      [at(16, 2), lines, 0.9],
      [at(16, 3.6), [r.issue[0] - 200, r.issue[1] - 260, 900, 420], 0.9],
    ]);
    for (const { f, ty } of typers)
      ty.draw(
        seg(t, typeAt[f][0], typeAt[f][1]),
        t < typeAt[f][1] + 0.1 && t > typeAt[f][0] - 0.05,
      );
    hlIssue.draw(seg(t, issueT - 0.3, issueT + 0.1) * (1 - seg(t, at(17, 3), at(18, 0))));
    const [ix, iy] = bw.toWin(r.issue[0] + r.issue[2] * 0.55, r.issue[1] + r.issue[3] * 0.6, c);
    const winX = 60;
    const winY = 140;
    cur.draw(
      t,
      [
        [at(16, 1), winX + 700, winY + 700],
        [issueT - 0.15, winX + ix, winY + iy],
      ],
      [issueT],
      seg(t, at(16, 1), at(16, 1.5)) * (1 - seg(t, at(17, 3), at(18, 0))),
    );
    cap.draw(t, at(12, 1), at(15, 0));
    sub.draw(t, at(12, 2.5), at(15, 0), 0.04);
    checksTitle.draw(t, at(15, 0.5), at(17, 3.3));
    items.forEach((it, i) => {
      const q = ease.outExpo(seg(t, at(15, 2) + i * BEAT, at(15, 2) + i * BEAT + 0.6));
      it.style.opacity = (q * (1 - seg(t, at(17, 3), at(17, 3.6)))).toFixed(3);
      it.style.transform = `translateX(${((1 - q) * 40).toFixed(1)}px)`;
    });
    checks.style.top = `${lerp(660, 350, ease.inOut(seg(t, at(15, 0), at(15, 1.5))))}px`;
    checksTitle.node.style.top = `${lerp(520, 150, ease.inOut(seg(t, at(15, 0), at(15, 1.5))))}px`;
  };
});

// ── 5. Издаден: номер от сървъра, PDF и XML, веригата ────────────────────────────────────────────
scene(18, 21, (root) => {
  const bw = browserWindow(root, 'doc', `${URL_BASE}/${ORG}/d/0000000004`, 1180, 760);
  place(bw.win, 90, 170);
  const r = window.SHOTS.doc.rects;
  const hlNum = highlight(bw.layers.cam, r.h1, 10);
  const files = [r.pdf[0], r.pdf[1], r.cii[0] + r.cii[2] - r.pdf[0], r.pdf[3]];
  const hlFiles = highlight(bw.layers.cam, files, 10);
  const cap = kinetic(root, '*Издаден.*\nНомерът идва\nот сървъра.', 'h2', 1350, 220, { w: 500 });
  const capB = kinetic(root, 'Промяната след издаване\n*се вижда.*', 'h2', 0, 150, {
    w: W,
    align: 'center',
  });
  const chain = el('div', '', root);
  chain.style.cssText = 'position:absolute;inset:0;';
  const hashes = ['9c41…e07a', '3fb2…19c8', 'd06e…a4f1'];
  const blocks = [2, 3, 4].map((n, i) => {
    const b = el(
      'div',
      'block',
      chain,
      `<div class="n">№ ${String(n).padStart(10, '0')}</div><div class="hsh">${hashes[i]}</div><div class="lbl">звено ${n} · SHA-256 + печат</div>`,
    );
    b.style.width = '360px';
    place(b, 240 + i * 520, 470);
    return b;
  });
  const links = [0, 1].map((i) => {
    const l = el('div', 'link', chain);
    place(l, 240 + i * 520 + 360, 545, 160, 3);
    return l;
  });
  return (t) => {
    const out = ease.inOut(seg(t, at(19, 2), at(20, 0)));
    const winIn = ease.outExpo(seg(t, at(18) + 0.15, at(18) + 1.3));
    bw.win.style.opacity = (Math.min(1, winIn * 1.4) * (1 - out)).toFixed(3);
    bw.win.style.transform = `perspective(2200px) rotateY(${lerp(10, 3, winIn).toFixed(2)}deg) translateY(${((1 - winIn) * 80).toFixed(1)}px) scale(${lerp(1, 0.92, out).toFixed(3)})`;
    bw.camera(t, [
      [at(18), [r.h1[0] - 40, r.h1[1] - 120, 1100, 480], 0.95],
      [at(19, 0), [r.pdf[0] - 260, r.pdf[1] - 60, 1000, 300], 0.95],
    ]);
    hlNum.draw(seg(t, at(18, 1), at(18, 1.6)) * (1 - seg(t, at(18, 3.5), at(19, 0))));
    hlFiles.draw(seg(t, at(19, 0.3), at(19, 0.9)) * (1 - out));
    cap.draw(t, at(18, 0.5), at(19, 2));
    capB.draw(t, at(19, 3), at(20, 3.4));
    blocks.forEach((b, i) => {
      const q = ease.outBack(
        seg(t, at(20, 0) + i * BEAT * 0.75, at(20, 0) + i * BEAT * 0.75 + 0.55),
      );
      b.style.opacity = (clamp(q) * (1 - seg(t, at(20, 3.3), at(20, 3.8)))).toFixed(3);
      b.style.transform = `translateY(${((1 - q) * 50).toFixed(1)}px)`;
    });
    links.forEach((l, i) => {
      const q = ease.inOut(seg(t, at(20, 0.6) + i * BEAT * 0.75, at(20, 1.2) + i * BEAT * 0.75));
      l.style.transform = `scaleX(${q.toFixed(3)})`;
      l.style.opacity = String(1 - seg(t, at(20, 3.3), at(20, 3.8)));
    });
  };
});
