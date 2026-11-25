// The value bar of the sketch editor — one row right above the sheet, never under the soft keyboard:
// the number of a dimension (the numeric keypad, "Ø" and "R" put in front, "Abc" for letters), the words
// of a text or a callout. OK or Enter takes it, × or Esc drops it (Esc never reaches the dialog then).
// The keyboard opens only now — after the drags, so it never covers them.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { dialog, texts, view, regole } = ed;
  const bar = dialog.querySelector('[data-schizzo-valore]');
  const label = bar.querySelector('label');
  const input = bar.querySelector('#schizzo-valore');
  const chips = Array.from(bar.querySelectorAll('[data-schizzo-prefisso]'));
  const abc = bar.querySelector('[data-schizzo-abc]');
  let current = null;

  const keypad = (numeric) => {
    input.inputMode = numeric ? 'decimal' : 'text';
    abc.setAttribute('aria-pressed', String(!numeric));
  };

  const close = () => {
    if (!current) return;
    const { onClose } = current;
    current = null;
    bar.hidden = true;
    ed.barChanged();
    if (onClose) onClose();
    ed.canvas.focus({ preventScroll: true });
  };

  // `mode`: quota | testo | richiamo; `onOk(text)` — the cleaned text (a dimension may be empty: "?").
  const open = ({ mode, value, onOk, onClose = null }) => {
    if (current) close();
    current = { mode, onOk, onClose };
    const quota = mode === 'quota';
    label.textContent = texts.valore[mode];
    input.maxLength = quota ? view.maxQuota : view.maxTesto;
    input.value = value || '';
    chips.forEach((chip) => {
      chip.hidden = !quota;
    });
    abc.hidden = !quota;
    // Letters after "Ø" or "R" — the keyboard with letters; the prefix itself is not one.
    keypad(quota && !/[a-z]/i.test((value || '').replace(/^(Ø|R)\s*/, '')));
    bar.hidden = false;
    ed.barChanged();
    // In a scrolled column of bars (phone on its side) the bar comes into view.
    bar.scrollIntoView({ block: 'nearest' });
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  };

  const ok = () => {
    if (!current) return;
    const text = regole.pulito(input.value);
    const { mode, onOk } = current;
    if (text || mode !== 'testo') onOk(text);
    close();
  };

  bar.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    if (button.hasAttribute('data-schizzo-valore-ok')) ok();
    else if (button.hasAttribute('data-schizzo-valore-annulla')) close();
    else if (button === abc) {
      keypad(input.inputMode !== 'decimal');
      input.focus({ preventScroll: true });
    } else if (button.hasAttribute('data-schizzo-prefisso')) {
      const prefix = button.dataset.schizzoPrefisso;
      const rest = input.value.replace(/^(Ø|R)\s*/, '');
      input.value = `${prefix} ${rest}`;
      input.focus({ preventScroll: true });
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ok();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });

  ed.valueBar = {
    open,
    ok,
    close,
    get isOpen() {
      return current !== null;
    },
  };
})();
