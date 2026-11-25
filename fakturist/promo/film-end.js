// Сцени 6–12 и рендерът по време (promo/README.md). Първата половина е във film.js.

// ── 6. Шкафчето: между фирмите във Фактурист ─────────────────────────────────────────────────────
scene(21, 24, (root) => {
  const title = kinetic(
    root,
    'Между фирмите във Фактурист —\n*направо в шкафчето.*',
    'h2',
    0,
    120,
    { w: W, align: 'center' },
  );
  const sub = kinetic(root, 'PDF и XML пристигат сами, с писмо до получателя.', 'sub', 0, 830, {
    w: W,
    align: 'center',
  });
  const a = el(
    'div',
    'card org',
    root,
    '<div class="nm">Мелница Злато ООД</div><div class="meta">издава фактура № 0000000001</div><span class="pill tag">изпраща</span>',
  );
  const b = el(
    'div',
    'card org',
    root,
    '<div class="nm">Пекарна Зора ЕООД</div><div class="meta">получател по ЕИК</div><span class="pill tag">Шкафче · 1 нов</span>',
  );
  place(a, 170, 430);
  place(b, 1230, 430);
  const doc = el(
    'div',
    'doc',
    root,
    '<div class="bar t"></div><div class="bar"></div><div class="bar"></div><div class="bar" style="width:70%"></div><div class="bar"></div><div class="bar" style="width:50%"></div><span class="badge">XML</span>',
  );
  const badge = b.querySelector('.tag');
  return (t) => {
    title.draw(t, at(21, 0.2), at(23, 3.3));
    sub.draw(t, at(22, 2), at(23, 3.3), 0.04);
    [a, b].forEach((c, i) => {
      const q = ease.outExpo(seg(t, at(21, 0.6) + i * 0.25, at(21, 2) + i * 0.25));
      c.style.opacity = (q * (1 - seg(t, at(23, 3.2), at(23, 3.7)))).toFixed(3);
      c.style.transform = `translateY(${((1 - q) * 60).toFixed(1)}px)`;
    });
    const f = ease.inOutQuint(seg(t, at(22, 0), at(22, 3)));
    const x = lerp(170 + 360, 1230 + 300, f);
    const y = 430 + 20 - Math.sin(f * Math.PI) * 230;
    place(doc, x, y);
    const vis = seg(t, at(21, 3.5), at(22, 0)) * (1 - seg(t, at(22, 3), at(22, 3.4)));
    doc.style.opacity = vis.toFixed(3);
    doc.style.transform = `rotate(${lerp(-8, 6, f).toFixed(2)}deg) scale(${(1 - Math.sin(f * Math.PI) * -0.12).toFixed(3)})`;
    const pop = ease.outBack(seg(t, at(22, 3), at(23, 0)));
    badge.style.transform = `scale(${lerp(1, 1.15, Math.sin(clamp(pop) * Math.PI)).toFixed(3)})`;
    badge.style.background = pop > 0 ? 'rgba(44,197,181,0.28)' : '';
  };
});

// ── 7. Кантори ───────────────────────────────────────────────────────────────────────────────────
scene(24, 28, (root) => {
  const title = kinetic(root, 'За счетоводни\n*кантори.*', 'h1', 120, 200, { w: 640 });
  const sub = kinetic(
    root,
    'Всички фирми-клиенти\nна едно място.\nИздавате от тяхно име\nпо пълномощно.',
    'sub',
    120,
    470,
    { w: 600 },
  );
  const own = el('div', 'pill solo', root, 'Собствеността остава на фирмата');
  place(own, 120, 790);
  const bw = browserWindow(root, 'firm-home', `${URL_BASE}/app`, 1080, 760);
  place(bw.win, 760, 170);
  const r = window.SHOTS['firm-home'].rects;
  const rows = (r.rows || []).slice(0, 3).map((row) => highlight(bw.layers.cam, row, 4));
  return (t) => {
    title.draw(t, at(24, 0.2), at(27, 3.3));
    sub.draw(t, at(24, 2), at(27, 3.3), 0.04);
    const o = ease.outBack(seg(t, at(26, 0), at(26, 2)));
    own.style.opacity = (clamp(o) * (1 - seg(t, at(27, 3), at(27, 3.6)))).toFixed(3);
    own.style.transform = `translateY(${((1 - clamp(o)) * 20).toFixed(1)}px)`;
    const winIn = ease.outExpo(seg(t, at(24, 0.5), at(25, 0.5)));
    bw.win.style.opacity = (winIn * (1 - seg(t, at(27, 3), at(27, 3.6)))).toFixed(3);
    bw.win.style.transform = `perspective(2200px) rotateY(${lerp(-22, -8, winIn).toFixed(2)}deg) translateX(${((1 - winIn) * 140).toFixed(1)}px)`;
    const table = r.table || [0, 0, 1440, 900];
    bw.camera(t, [
      [at(24, 1), [0, 0, 1440, 760], 1],
      [
        at(25, 2),
        [
          table[0] - 30,
          (r.h1 ? r.h1[1] : table[1]) - 20,
          table[2] + 60,
          table[1] + table[3] - (r.h1 ? r.h1[1] : table[1]) + 60,
        ],
        0.95,
      ],
    ]);
    rows.forEach((h, i) =>
      h.draw(
        seg(t, at(26, 0) + i * BEAT, at(26, 0.5) + i * BEAT) * (1 - seg(t, at(27, 2), at(27, 3))),
      ),
    );
  };
});

// ── 8. Автоматизация: плочки с реални екрани ─────────────────────────────────────────────────────
scene(28, 32, (root) => {
  const title = kinetic(root, 'Рутината — *автоматично.*', 'h2', 0, 90, { w: W, align: 'center' });
  const defs = [
    ['recurring', 'Повтарящи се фактури', 'Всеки месец, тримесечие или година', 0],
    ['bank', 'Сверка с банката', 'Извлечението предлага коя фактура е платена', 0],
    ['recurring', 'Напомняния', 'Писмо при просрочено плащане', 1],
    ['api', 'REST API', 'Издаване и четене от вашата система', 0],
  ];
  const tiles = defs.map(([key, h, p, lower], i) => {
    const tile = el('div', 'card tile', root, `<h4>${h}</h4><p>${p}</p>`);
    const col = i % 2;
    const row = Math.floor(i / 2);
    place(tile, 150 + col * 830, 220 + row * 410, 790, 380);
    const box = el('div', 'shot', tile);
    const img = el('img', '', box);
    const shot = window.SHOTS[key];
    img.src = `/shots/${shot.file}`;
    img.style.width = `${shot.w}px`;
    const rr = shot.rects;
    const focus =
      key === 'recurring'
        ? lower
          ? [rr.table[0], rr.table[1] + rr.table[3] + 30, 1000, 300]
          : [rr.table[0], rr.table[1] - 20, 1000, 260]
        : rr.table || rr.h1;
    return { tile, img, focus };
  });
  return (t) => {
    title.draw(t, at(28, 0.2), at(31, 3.3));
    tiles.forEach(({ tile, img, focus }, i) => {
      const q = ease.outExpo(seg(t, at(28, 1.5) + i * BEAT, at(28, 1.5) + i * BEAT + 1));
      tile.style.opacity = (q * (1 - seg(t, at(31, 3.2), at(31, 3.7)))).toFixed(3);
      tile.style.transform = `perspective(1600px) rotateX(${((1 - q) * 25).toFixed(2)}deg) translateY(${((1 - q) * 60).toFixed(1)}px)`;
      const s = 0.86 + seg(t, at(28), at(32)) * 0.06;
      img.style.transform = `translate(${(-focus[0] * s + 30).toFixed(1)}px, ${(-focus[1] * s + 14).toFixed(1)}px) scale(${s.toFixed(4)})`;
    });
  };
});

// ── 9. Дневници по ДДС и SAF-T ───────────────────────────────────────────────────────────────────
scene(32, 35, (root) => {
  const bw = browserWindow(root, 'journal', `${URL_BASE}/${ORG}/dnevnik`, 1080, 780);
  place(bw.win, 90, 180);
  const title = kinetic(root, 'Дневници\nпо *ДДС.*', 'h1', 1260, 200, { w: 600 });
  const files = el('div', '', root);
  files.style.cssText = 'position:absolute;left:1260px;top:470px;width:600px;';
  const rows = ['PRODAGBI.TXT', 'POKUPKI.TXT', 'Данни за SAF-T 1.0.3'].map((s) =>
    el(
      'div',
      'check',
      files,
      `<i>${ICONS.check}</i><span class="${s.endsWith('TXT') ? 'mono' : ''}">${s}</span>`,
    ),
  );
  const note = kinetic(
    root,
    'По Приложение № 12 към ППЗДДС.\nПодавате вие — файловете са готови.',
    'small',
    1260,
    760,
    { w: 620 },
  );
  return (t) => {
    const winIn = ease.outExpo(seg(t, at(32) - 0.2, at(33)));
    bw.win.style.opacity = (winIn * (1 - seg(t, at(34, 3), at(34, 3.6)))).toFixed(3);
    bw.win.style.transform = `perspective(2200px) rotateY(${lerp(16, 5, winIn).toFixed(2)}deg) translateY(${((1 - winIn) * 80).toFixed(1)}px)`;
    bw.camera(t, [
      [at(32), [0, 0, 1440, 900], 1],
      [at(33, 2), [300, 120, 1100, 600], 0.95],
    ]);
    title.draw(t, at(32, 0.3), at(34, 3.3));
    rows.forEach((row, i) => {
      const q = ease.outExpo(seg(t, at(33, 0) + i * BEAT, at(33, 0) + i * BEAT + 0.6));
      row.style.opacity = (q * (1 - seg(t, at(34, 3.2), at(34, 3.7)))).toFixed(3);
      row.style.transform = `translateX(${((1 - q) * 40).toFixed(1)}px)`;
    });
    note.draw(t, at(34, 0), at(34, 3.3), 0.03);
  };
});

// ── 10. Сигурност и контрол ──────────────────────────────────────────────────────────────────────
scene(35, 37, (root) => {
  const title = kinetic(root, 'Вашите данни — *под контрол.*', 'h2', 0, 200, {
    w: W,
    align: 'center',
  });
  const items = [
    ['globe', 'Сървърите са в ЕС'],
    ['shield', 'Двуфакторен вход'],
    ['archive', 'Целият архив — с един клик'],
  ].map(([icon, label], i) => {
    const box = el('div', '', root);
    box.style.cssText = `position:absolute;left:${210 + i * 520}px;top:430px;width:460px;display:flex;flex-direction:column;align-items:center;gap:34px;text-align:center;`;
    el('div', 'icon', box, ICONS[icon]);
    el('div', 'h3', box, label).style.fontWeight = '600';
    return box;
  });
  return (t) => {
    title.draw(t, at(35, 0.1), at(36, 3.3));
    items.forEach((box, i) => {
      const q = ease.outBack(
        seg(t, at(35, 1) + i * BEAT * 0.75, at(35, 1) + i * BEAT * 0.75 + 0.7),
      );
      box.style.opacity = (clamp(q) * (1 - seg(t, at(36, 3.2), at(36, 3.7)))).toFixed(3);
      box.style.transform = `translateY(${((1 - q) * 60).toFixed(1)}px) scale(${lerp(0.85, 1, clamp(q)).toFixed(3)})`;
    });
  };
});

// ── 11. Цени (без ДДС — както на витрината) ──────────────────────────────────────────────────────
scene(37, 40, (root) => {
  const title = kinetic(root, 'Започнете *безплатно.*', 'h2', 0, 110, { w: W, align: 'center' });
  const plans = [
    ['Безплатен', '0 €', '', 'PDF и XML по EN 16931,\nшкафче, проформи', false],
    ['Професионален', '9 €', '/ месец', 'До 5 потребители,\nповтарящи се, напомняния', false],
    ['Бизнес', '29 €', '/ месец', 'Банка, API, данни за SAF-T,\nроли и одит', true],
    ['Кантора', '0 €', '', 'Първите 3 фирми-клиенти;\nвсяка следваща — 4 € на месец', false],
  ].map(([nm, amt, per, ds, hi], i) => {
    const c = el(
      'div',
      `card price${hi ? ' hi' : ''}`,
      root,
      `<div class="nm">${nm}</div><div class="amt">${amt}<small>${per}</small></div><div class="ds">${ds.replace('\n', '<br>')}</div>`,
    );
    place(c, 110 + i * 435, 290, 405, 380);
    return c;
  });
  const note = kinetic(
    root,
    'Цените са без ДДС. Плащане с карта или банков превод.',
    'small',
    0,
    730,
    { w: W, align: 'center' },
  );
  return (t) => {
    title.draw(t, at(37, 0.1), at(39, 3.3));
    plans.forEach((c, i) => {
      const q = ease.outExpo(
        seg(t, at(37, 1.2) + i * BEAT * 0.6, at(37, 1.2) + i * BEAT * 0.6 + 0.9),
      );
      c.style.opacity = (q * (1 - seg(t, at(39, 3.2), at(39, 3.7)))).toFixed(3);
      c.style.transform = `translateY(${((1 - q) * 80).toFixed(1)}px) rotateX(${((1 - q) * 18).toFixed(2)}deg)`;
    });
    note.draw(t, at(38, 2), at(39, 3.3), 0.03);
  };
});

// ── 12. Призив ───────────────────────────────────────────────────────────────────────────────────
scene(40, 43.6, (root) => {
  const logo = el('img', 'logo', root);
  logo.src = '/brand/logo-light.png';
  const cta = kinetic(root, 'Създайте акаунт\nи издайте *първия си документ.*', 'h2', 0, 470, {
    w: W,
    align: 'center',
  });
  const url = el('div', 'pill solo', root, URL_BASE);
  url.style.fontSize = '34px';
  url.style.padding = '16px 34px';
  const soon = el('div', 'small', root, 'Предстои: Peppol · отчитане към НАП');
  const by = el('div', 'small', root, 'Продукт на Carbon Stealth VCC');
  [soon, by].forEach((n) => (n.style.position = 'absolute'));
  return (t) => {
    const q = ease.outExpo(seg(t, at(40, 0), at(41, 0)));
    const lw = 760;
    const lh = lw / window.BRAND.logoRatio;
    place(logo, W / 2 - lw / 2, 230, lw, lh);
    logo.style.opacity = q.toFixed(3);
    logo.style.transform = `scale(${lerp(0.9, 1, q).toFixed(3)})`;
    cta.draw(t, at(40, 2), Infinity);
    const u = ease.outBack(seg(t, at(41, 2), at(42, 0)));
    url.style.left = `${W / 2 - url.offsetWidth / 2}px`;
    url.style.top = '700px';
    url.style.opacity = clamp(u).toFixed(3);
    url.style.transform = `scale(${lerp(0.8, 1, clamp(u)).toFixed(3)})`;
    const s = seg(t, at(42, 0), at(42, 1));
    place(soon, 0, 830, W);
    soon.style.textAlign = 'center';
    soon.style.opacity = s.toFixed(3);
    place(by, 0, 960, W);
    by.style.textAlign = 'center';
    by.style.opacity = seg(t, at(42, 1), at(42, 2)).toFixed(3);
  };
});

// ── рендерът: фон, зърно, сцени ──────────────────────────────────────────────────────────────────
const bg = document.getElementById('bg');
const grid = document.getElementById('grid');
const grain = document.getElementById('grain');
const g2d = grain.getContext('2d');
const noise = g2d.createImageData(grain.width, grain.height);
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
window.render = (t) => {
  bg.style.setProperty('--gx', `${30 + Math.sin(t * 0.13) * 12}%`);
  bg.style.setProperty('--gy', `${22 + Math.cos(t * 0.11) * 8}%`);
  bg.style.setProperty('--hx', `${78 + Math.cos(t * 0.09) * 10}%`);
  bg.style.setProperty('--hy', `${82 + Math.sin(t * 0.12) * 6}%`);
  grid.style.backgroundPosition = `0 ${(t * 18) % 80}px`;
  const r = rand(Math.floor(t * 30) + 1);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = r() * 255;
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
    noise.data[i + 3] = 255;
  }
  g2d.putImageData(noise, 0, 0);
  const fadeIn = seg(t, 0, 0.6);
  const fadeOut = 1 - seg(t, END - 1.2, END);
  document.getElementById('stage').style.opacity = (fadeIn * fadeOut).toFixed(3);
  for (const s of scenes) {
    const alpha = sceneAlpha(t, s.a, s.b, 0.5, 0.6);
    s.root.style.opacity = alpha.toFixed(3);
    s.root.style.display = alpha > 0.001 ? '' : 'none';
    if (alpha > 0.001) s.draw(t);
  }
};
Promise.all(
  [...document.images].map((img) =>
    img.complete ? null : new Promise((ok) => (img.onload = img.onerror = ok)),
  ),
).then(() => {
  window.render(0);
  window.__ready = true;
});
