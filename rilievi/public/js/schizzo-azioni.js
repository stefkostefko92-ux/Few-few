// What the sketch editor does with the selection (schizzo-selezione.js): duplicate, delete, turn (a
// symbol a quarter, an ellipse swaps its axes), mirror a symbol, the diameter or the radius of a circle
// (a new dimension, its number in the value bar after "Ø" or "R"), edit a text, copy and paste (inside the
// editor only — nothing from outside is taken), nudge with the arrow keys (one step in the history while
// they go on), and the colour, thickness and dashes chosen while something is selected.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed || !ed.selection) return;
  const { regole } = ed;
  const COPY = 25;
  let clipboard = [];

  const selected = () => ed.selection.get();
  const single = () => (selected().length === 1 ? selected()[0] : null);
  const isCircle = (el) => el && el.t === 'e' && el.rx === el.ry;

  // Copies a step down and right (as far as the sheet goes), added at the end and selected.
  const duplicate = (list) => {
    if (!list.length) return;
    const [dx, dy] = regole.limitMove(list, COPY, COPY);
    const copies = list.map((el) => regole.normalizza(regole.moved(el, dx, dy)));
    if (copies.every(Boolean) && ed.commit(ed.elements.concat(copies))) ed.selection.set(copies);
  };
  const remove = () => {
    const gone = new Set(selected());
    if (gone.size && ed.commit(ed.elements.filter((el) => !gone.has(el)))) ed.selection.clear();
  };
  const turn = () =>
    ed.selection.replace(
      selected()
        .filter((el) => el.t === 's' || el.t === 'e')
        .map((el) => [
          el,
          regole.normalizza(
            el.t === 's' ? { ...el, r: (el.r + 1) % 4 } : { ...el, rx: el.ry, ry: el.rx },
          ),
        ])
        .filter(([, next]) => next),
    );
  const mirror = () =>
    ed.selection.replace(
      selected()
        .filter((el) => el.t === 's')
        .map((el) => [el, regole.normalizza({ ...el, f: el.f ? undefined : 1 })])
        .filter(([, next]) => next),
    );

  // A dimension of the circle: the diameter across it (above it when the circle is small), or the
  // radius; the first way that stays on the sheet.
  const measure = (kind) => {
    const el = single();
    if (!isCircle(el)) return;
    const r = el.rx;
    const across = [
      [el.x - r, el.y, el.x + r, el.y],
      [el.x, el.y - r, el.x, el.y + r],
    ];
    const tries =
      kind === 'raggio'
        ? [
            [el.x + r, el.y],
            [el.x - r, el.y],
            [el.x, el.y - r],
            [el.x, el.y + r],
          ].map(([x2, y2]) => ({ x1: el.x, y1: el.y, x2, y2, o: 0, m: 'r' }))
        : across.flatMap(([x1, y1, x2, y2]) =>
            (r < 100 ? [-(r + 50), r + 50] : [0]).map((o) => ({ x1, y1, x2, y2, o })),
          );
    const style = ed.style();
    const ready = tries
      .map((t) => ({ t: 'q', c: style.c, s: style.s, ...t, v: '?' }))
      .find((q) => regole.valido(q));
    if (!ready) {
      ed.error(ed.texts.fuori);
      return;
    }
    ed.valueBar.open({
      mode: 'quota',
      value: kind === 'raggio' ? 'R ' : 'Ø ',
      onOk: (v) => {
        const added = ed.add({ ...ready, v });
        if (added) ed.selection.set([added]);
      },
    });
  };

  const edit = () => {
    const el = single();
    if (el && (el.t === 'x' || el.t === 'q' || (el.t === 'a' && el.v))) ed.editText(el);
  };

  const copy = () => {
    clipboard = selected().slice();
  };
  const paste = () => {
    const kept = clipboard.filter((el) => regole.valido(el));
    if (kept.length) duplicate(kept);
  };
  const nudge = (dx, dy) => {
    if (!selected().length) return;
    const [mx, my] = regole.limitMove(selected(), dx, dy);
    if (!mx && !my) return;
    const pairs = selected().map((el) => [el, regole.moved(el, mx, my)]);
    const map = new Map(pairs);
    const next = pairs.map(([, moved]) => moved);
    // One step while the same elements go on moving (their places in the sheet do not change).
    const key = `nudge:${selected().map((el) => ed.elements.indexOf(el))}`;
    if (
      ed.commit(
        ed.elements.map((el) => (map.has(el) ? map.get(el) : el)),
        key,
      )
    ) {
      ed.selection.set(next);
    }
  };
  // The style chosen while something is selected changes it — one step in the history.
  const restyle = () => {
    const style = ed.style();
    ed.selection.replace(
      selected()
        .map((el) => {
          const next = { ...el, c: style.c, s: style.s };
          if (el.t !== 'x' && el.t !== 'q') next.k = style.k;
          return [el, regole.normalizza(next)];
        })
        .filter(([el, next]) => next && JSON.stringify(next) !== JSON.stringify(el)),
    );
  };

  // Which actions make sense for the selection (the bar shows and enables them).
  const available = () => {
    const list = selected();
    const el = single();
    return {
      any: list.length > 0,
      duplica: list.length > 0,
      elimina: list.length > 0,
      ruota: list.some((x) => x.t === 's' || x.t === 'e'),
      specchia: list.some((x) => x.t === 's'),
      diametro: isCircle(el),
      raggio: isCircle(el),
      modifica: Boolean(el && (el.t === 'x' || el.t === 'q' || (el.t === 'a' && el.v))),
    };
  };

  ed.actions = {
    duplica: () => duplicate(selected()),
    elimina: remove,
    ruota: turn,
    specchia: mirror,
    diametro: () => measure('diametro'),
    raggio: () => measure('raggio'),
    modifica: edit,
    copy,
    paste,
    nudge,
    restyle,
    available,
  };
})();
