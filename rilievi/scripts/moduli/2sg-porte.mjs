// The bottom of the 2SG sheet: clear opening and kind of door, for the car and for the landings — a row
// per kind with its little plan of the leaves (jambs, leaves staggered in depth, the arrow of the
// closing) and the number to order.

const TYPES = [
  ['1AT CD', '1atCd', 1, 'right'],
  ['1AT CS', '1atCs', 1, 'left'],
  ['2AO', '2ao', 1, 'centre'],
  ['2AT CD', '2atCd', 2, 'right'],
  ['2AT CS', '2atCs', 2, 'left'],
  ['3AT CD', '3atCd', 3, 'right'],
  ['3AT CS', '3atCs', 3, 'left'],
  ['4AT', '4at', 2, 'centre'],
  ['6AT', '6at', 3, 'centre'],
];

function arrow(doc, cx, ay, way) {
  const dir = way === 'right' ? 1 : -1;
  const tip = cx + dir * 9;
  doc
    .lineWidth(0.6)
    .moveTo(cx - dir * 9, ay)
    .lineTo(tip, ay)
    .stroke();
  doc
    .moveTo(tip, ay)
    .lineTo(tip - dir * 3.4, ay - 1.8)
    .lineTo(tip - dir * 3.4, ay + 1.8)
    .closePath()
    .fill('#000');
}

/** A door seen from above: the two jambs, the leaves staggered in depth, the arrow of the closing. */
function door(doc, x, yTop, w, panels, way) {
  const frameY = yTop + 4;
  doc.lineWidth(0.7);
  doc
    .moveTo(x, frameY - 5)
    .lineTo(x, frameY)
    .lineTo(x + 9, frameY)
    .stroke();
  doc
    .moveTo(x + w, frameY - 5)
    .lineTo(x + w, frameY)
    .lineTo(x + w - 9, frameY)
    .stroke();
  const open = w - 18;
  const x0 = x + 9;
  const leaf = (lx, ly, lw) => doc.rect(lx, ly, lw, 2.4).fillAndStroke('#9a9a9a', '#000');
  doc.lineWidth(0.4);
  if (way === 'centre') {
    const half = open / 2;
    const seg = half / panels;
    for (let i = 0; i < panels; i++) {
      const ly = frameY + 2.5 + i * 3.4;
      leaf(x0 + i * seg - 1, ly, seg + 2);
      leaf(x0 + open - (i + 1) * seg - 1, ly, seg + 2);
    }
    arrow(doc, x0 + half - 22, frameY - 4, 'right');
    arrow(doc, x0 + half + 22, frameY - 4, 'left');
  } else {
    const seg = open / panels;
    for (let i = 0; i < panels; i++) {
      const ly = frameY + 2.5 + i * 3.4;
      const slot = way === 'right' ? panels - 1 - i : i;
      leaf(x0 + slot * seg - 1, ly, seg + 2);
    }
    arrow(doc, x0 + open / 2, frameY - 4, way);
  }
}

/** The two panels side by side, from `top`; returns where they end. */
export function portePanels(pen, { top, left, mid, right }) {
  const { doc, rect, hline, vline, text, line, labelLine } = pen;
  const rowH = 25.5;
  const height = 22 + TYPES.length * rowH;
  for (const [side, cap, x0, x1] of [
    ['cabina', 'Cabina', left, mid - 3],
    ['piano', 'Piano', mid + 3, right],
  ]) {
    rect(x0, top, x1 - x0, height);
    const e = text('LUCE PORTA:', x0 + 6, top + 15, { font: 'bold', size: 9.4 });
    line(`luce${cap}L`, e + 6, e + 76, top + 15);
    text('x', e + 80, top + 15, { font: 'bold', size: 9.4 });
    line(`luce${cap}H`, e + 88, x1 - 8, top + 15);
    hline(x0, x1, top + 22);
    const split = x0 + (x1 - x0) * 0.5;
    vline(split, top + 22, top + height);
    TYPES.forEach(([label, key, panels, way], i) => {
      const rowTop = top + 22 + i * rowH;
      if (i > 0) hline(x0, x1, rowTop, 0.3);
      door(doc, x0 + 10, rowTop + 7, split - x0 - 20, panels, way);
      text(label, split + 8, rowTop + 15.5, { font: 'bold', size: 8.4 });
      labelLine(
        'NR.',
        `${side}${key[0].toUpperCase()}${key.slice(1)}`,
        split + 62,
        rowTop + 15.5,
        x1 - 8,
      );
    });
  }
  return top + height;
}
