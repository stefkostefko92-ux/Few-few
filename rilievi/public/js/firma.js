// Signatures with a finger, a pen or the mouse on the signing page of an intervention sheet: each pad
// records its strokes in a 600 × 200 box (whole numbers) into its hidden input as
// {"s": [[x, y, x, y, …], …]} — the server checks them (src/interventi/conferma.ts) and draws them the
// same in the page and in the PDF. "Cancella" empties the pad. A signature sent back with an error (same
// version of the sheet) is drawn again from its input.
(() => {
  const W = 600;
  const H = 200;
  const MAX_POINTS = 6000;

  for (const pad of document.querySelectorAll('[data-firma]')) {
    const canvas = pad.querySelector('[data-firma-canvas]');
    const input = pad.querySelector('[data-firma-input]');
    const clear = pad.querySelector('[data-firma-clear]');
    if (!canvas || !input) continue;
    const ctx = canvas.getContext('2d');
    let strokes = [];
    try {
      const saved = input.value ? JSON.parse(input.value) : null;
      if (saved && Array.isArray(saved.s)) strokes = saved.s;
    } catch {
      strokes = [];
    }
    let current = null;
    const total = () => strokes.reduce((sum, s) => sum + s.length / 2, 0);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      for (const s of strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        if (s.length === 2) ctx.lineTo(s[0] + 0.1, s[1]);
        for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
        ctx.stroke();
      }
    };
    const save = () => {
      input.value = strokes.length ? JSON.stringify({ s: strokes }) : '';
      if (clear) clear.disabled = strokes.length === 0;
    };
    const point = (event) => {
      const box = canvas.getBoundingClientRect();
      const x = Math.round(((event.clientX - box.left) / box.width) * W);
      const y = Math.round(((event.clientY - box.top) / box.height) * H);
      return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || total() >= MAX_POINTS) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      current = point(event);
      strokes.push(current);
      draw();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!current || total() >= MAX_POINTS) return;
      const [x, y] = point(event);
      const lx = current[current.length - 2];
      const ly = current[current.length - 1];
      // Points closer than 2 units add nothing to the line but weigh on the signature.
      if (Math.abs(x - lx) + Math.abs(y - ly) < 2) return;
      current.push(x, y);
      draw();
    });
    const end = () => {
      if (!current) return;
      current = null;
      save();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    clear?.addEventListener('click', () => {
      strokes = [];
      draw();
      save();
    });
    draw();
    save();
  }
})();
