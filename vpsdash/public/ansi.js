// Минимален VT100/xterm емулатор — колкото трябва, за да изглежда истински
// терминал в браузъра (цветове, движение на курсора, изтриване, алтернативен
// екран за htop/nano). Чист JS без DOM → тества се в Node.
//
// Съзнателно НЕ поддържа: пълния VT спектър (sixel, мишка, регион на превъртане).
// Ако някой ден потрябва пълна съвместимост, това е мястото за xterm.js — но то
// е външна зависимост, а продуктът е на нула зависимости.

const DEFAULT_FG = -1;
const DEFAULT_BG = -1;

function blankCell() {
  return { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, dim: false, italic: false, underline: false, inverse: false };
}

export class Terminal {
  constructor(cols = 100, rows = 30, { scrollback = 1000 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.scrollbackCap = scrollback;
    this.reset();
  }

  reset() {
    this.lines = [];
    this.scrollTop = 0;
    this.cursor = { row: 0, col: 0 };
    this.style = blankCell();
    this.pending = '';
    this.alt = null; // запазен основен екран, докато сме в алтернативен
    this.title = '';
    for (let i = 0; i < this.rows; i++) this.lines.push(this.newLine());
  }

  newLine() {
    return Array.from({ length: this.cols }, blankCell);
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }

  // Абсолютният ред на курсора в буфера.
  absRow() {
    return this.scrollTop + this.cursor.row;
  }

  lineAt(abs) {
    while (this.lines.length <= abs) this.lines.push(this.newLine());
    const l = this.lines[abs];
    while (l.length < this.cols) l.push(blankCell());
    return l;
  }

  write(data) {
    const str = this.pending + String(data);
    this.pending = '';
    let i = 0;
    while (i < str.length) {
      const ch = str[i];

      if (ch === '\x1b') {
        const consumed = this.handleEscape(str, i);
        if (consumed === -1) {
          // Непълна последователност — изчакваме следващия къс.
          this.pending = str.slice(i);
          return;
        }
        i += consumed;
        continue;
      }

      i++;
      switch (ch) {
        case '\r':
          this.cursor.col = 0;
          break;
        case '\n':
          this.lineFeed();
          break;
        case '\b':
          this.cursor.col = Math.max(0, this.cursor.col - 1);
          break;
        case '\t':
          this.cursor.col = Math.min(this.cols - 1, (Math.floor(this.cursor.col / 8) + 1) * 8);
          break;
        case '\x07': // звънец — нищо визуално
          break;
        default:
          if (ch >= ' ') this.putChar(ch);
      }
    }
  }

  putChar(ch) {
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0;
      this.lineFeed();
    }
    const line = this.lineAt(this.absRow());
    line[this.cursor.col] = { ...this.style, ch };
    this.cursor.col++;
  }

  lineFeed() {
    this.cursor.row++;
    if (this.cursor.row >= this.rows) {
      this.cursor.row = this.rows - 1;
      this.scrollTop++;
      this.lineAt(this.scrollTop + this.rows - 1);
      // Ограничаваме историята — иначе дълга сесия изяжда паметта.
      const excess = this.lines.length - (this.rows + this.scrollbackCap);
      if (excess > 0) {
        this.lines.splice(0, excess);
        this.scrollTop -= excess;
      }
    }
    this.lineAt(this.absRow());
  }

  // Връща колко знака е изяла последователността, или -1 ако е непълна.
  handleEscape(str, start) {
    const next = str[start + 1];
    if (next === undefined) return -1;

    // OSC: ESC ] … BEL | ESC \  (заглавие на прозореца и др.)
    if (next === ']') {
      const bel = str.indexOf('\x07', start + 2);
      const st = str.indexOf('\x1b\\', start + 2);
      const end = bel === -1 ? st : st === -1 ? bel : Math.min(bel, st);
      if (end === -1) return -1;
      const body = str.slice(start + 2, end);
      const m = body.match(/^0;(.*)$/);
      if (m) this.title = m[1];
      return end - start + (end === st ? 2 : 1);
    }

    // CSI: ESC [ параметри финален-знак
    if (next === '[') {
      let i = start + 2;
      let params = '';
      let priv = '';
      if (str[i] === '?' || str[i] === '>' || str[i] === '!') {
        priv = str[i];
        i++;
      }
      while (i < str.length && /[\d;]/.test(str[i])) {
        params += str[i];
        i++;
      }
      if (i >= str.length) return -1;
      const final = str[i];
      this.csi(priv, params, final);
      return i - start + 1;
    }

    // Двузнакови: ESC c (нулиране), ESC M (обратен ред), ESC 7/8 (курсор)
    if (next === 'c') {
      this.reset();
      return 2;
    }
    if (next === '7') {
      this.saved = { ...this.cursor };
      return 2;
    }
    if (next === '8') {
      if (this.saved) this.cursor = { ...this.saved };
      return 2;
    }
    if (next === 'M') {
      this.cursor.row = Math.max(0, this.cursor.row - 1);
      return 2;
    }
    if (next === '(' || next === ')') return str[start + 2] === undefined ? -1 : 3; // набор знаци
    return 2; // непозната къса последователност — прескачаме
  }

  csi(priv, paramsStr, final) {
    const params = paramsStr.split(';').map((p) => (p === '' ? 0 : Number(p)));
    const p0 = params[0] || 0;

    if (priv === '?') {
      // Алтернативен екран (htop/nano/less): пазим основния и се връщаме след изход.
      if ((p0 === 1049 || p0 === 47 || p0 === 1047) && final === 'h') {
        if (!this.alt) {
          this.alt = { lines: this.lines, scrollTop: this.scrollTop, cursor: { ...this.cursor } };
          this.lines = Array.from({ length: this.rows }, () => this.newLine());
          this.scrollTop = 0;
          this.cursor = { row: 0, col: 0 };
        }
        return;
      }
      if ((p0 === 1049 || p0 === 47 || p0 === 1047) && final === 'l') {
        if (this.alt) {
          this.lines = this.alt.lines;
          this.scrollTop = this.alt.scrollTop;
          this.cursor = this.alt.cursor;
          this.alt = null;
        }
        return;
      }
      return; // другите частни режими (курсор, скоби при поставяне) не ни влияят
    }

    switch (final) {
      case 'A':
        this.cursor.row = Math.max(0, this.cursor.row - (p0 || 1));
        break;
      case 'B':
        this.cursor.row = Math.min(this.rows - 1, this.cursor.row + (p0 || 1));
        break;
      case 'C':
        this.cursor.col = Math.min(this.cols - 1, this.cursor.col + (p0 || 1));
        break;
      case 'D':
        this.cursor.col = Math.max(0, this.cursor.col - (p0 || 1));
        break;
      case 'G':
        this.cursor.col = clamp((p0 || 1) - 1, 0, this.cols - 1);
        break;
      case 'd':
        this.cursor.row = clamp((p0 || 1) - 1, 0, this.rows - 1);
        break;
      case 'H':
      case 'f':
        this.cursor.row = clamp((params[0] || 1) - 1, 0, this.rows - 1);
        this.cursor.col = clamp((params[1] || 1) - 1, 0, this.cols - 1);
        break;
      case 'J':
        this.eraseDisplay(p0);
        break;
      case 'K':
        this.eraseLine(p0);
        break;
      case 'L':
        this.insertLines(p0 || 1);
        break;
      case 'M':
        this.deleteLines(p0 || 1);
        break;
      case 'P':
        this.deleteChars(p0 || 1);
        break;
      case 'X':
        this.eraseChars(p0 || 1);
        break;
      case '@':
        this.insertChars(p0 || 1);
        break;
      case 'm':
        this.sgr(params, paramsStr);
        break;
      default:
        break; // непознат финал — игнорираме
    }
  }

  eraseDisplay(mode) {
    const abs = this.absRow();
    if (mode === 2 || mode === 3) {
      for (let r = 0; r < this.rows; r++) this.lines[this.scrollTop + r] = this.newLine();
      return;
    }
    if (mode === 1) {
      for (let r = this.scrollTop; r < abs; r++) this.lines[r] = this.newLine();
      this.eraseLine(1);
      return;
    }
    this.eraseLine(0);
    for (let r = abs + 1; r < this.scrollTop + this.rows; r++) this.lines[r] = this.newLine();
  }

  eraseLine(mode) {
    const line = this.lineAt(this.absRow());
    const from = mode === 0 ? this.cursor.col : 0;
    const to = mode === 1 ? this.cursor.col + 1 : this.cols;
    for (let c = from; c < to && c < this.cols; c++) line[c] = blankCell();
  }

  eraseChars(n) {
    const line = this.lineAt(this.absRow());
    for (let c = this.cursor.col; c < Math.min(this.cols, this.cursor.col + n); c++) line[c] = blankCell();
  }

  deleteChars(n) {
    const line = this.lineAt(this.absRow());
    line.splice(this.cursor.col, n);
    while (line.length < this.cols) line.push(blankCell());
  }

  insertChars(n) {
    const line = this.lineAt(this.absRow());
    for (let i = 0; i < n; i++) line.splice(this.cursor.col, 0, blankCell());
    line.length = this.cols;
  }

  insertLines(n) {
    for (let i = 0; i < n; i++) {
      this.lines.splice(this.absRow(), 0, this.newLine());
      this.lines.splice(this.scrollTop + this.rows, 1);
    }
  }

  deleteLines(n) {
    for (let i = 0; i < n; i++) {
      this.lines.splice(this.absRow(), 1);
      this.lines.splice(this.scrollTop + this.rows - 1, 0, this.newLine());
    }
  }

  sgr(params, raw) {
    if (raw === '' || params.length === 0) {
      this.style = blankCell();
      return;
    }
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === 0) this.style = blankCell();
      else if (p === 1) this.style.bold = true;
      else if (p === 2) this.style.dim = true;
      else if (p === 3) this.style.italic = true;
      else if (p === 4) this.style.underline = true;
      else if (p === 7) this.style.inverse = true;
      else if (p === 22) this.style.bold = this.style.dim = false;
      else if (p === 23) this.style.italic = false;
      else if (p === 24) this.style.underline = false;
      else if (p === 27) this.style.inverse = false;
      else if (p >= 30 && p <= 37) this.style.fg = p - 30;
      else if (p >= 90 && p <= 97) this.style.fg = p - 90 + 8;
      else if (p >= 40 && p <= 47) this.style.bg = p - 40;
      else if (p >= 100 && p <= 107) this.style.bg = p - 100 + 8;
      else if (p === 39) this.style.fg = DEFAULT_FG;
      else if (p === 49) this.style.bg = DEFAULT_BG;
      else if (p === 38 || p === 48) {
        // 38;5;n (256 цвята) или 38;2;r;g;b (true color)
        const target = p === 38 ? 'fg' : 'bg';
        if (params[i + 1] === 5) {
          this.style[target] = params[i + 2] ?? DEFAULT_FG;
          i += 2;
        } else if (params[i + 1] === 2) {
          this.style[target] = `rgb(${params[i + 2] || 0},${params[i + 3] || 0},${params[i + 4] || 0})`;
          i += 4;
        }
      }
    }
  }

  // Текстово съдържание (без стилове) — за тестове и копиране.
  toText({ trim = true } = {}) {
    const out = this.lines.map((l) => l.map((c) => c.ch).join(''));
    return (trim ? out.map((l) => l.replace(/\s+$/, '')) : out).join('\n').replace(/\n+$/, '');
  }

  // HTML с цветове — рендерът в браузъра.
  toHtml() {
    const parts = [];
    for (const line of this.lines) {
      let html = '';
      let run = null;
      let text = '';
      const flush = () => {
        if (!text) return;
        html += run ? `<span style="${run}">${escapeHtml(text)}</span>` : escapeHtml(text);
        text = '';
      };
      for (const cell of line) {
        const css = cellCss(cell);
        if (css !== run) {
          flush();
          run = css;
        }
        text += cell.ch;
      }
      flush();
      parts.push(html.replace(/\s+$/, '') || '');
    }
    // Махаме празните редове най-отдолу, за да не подскача изгледът.
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts.join('\n');
  }
}

const PALETTE = [
  '#1e2530', '#ff5c6c', '#33e6a0', '#ffb347', '#2bb3ff', '#c678dd', '#4dd0e1', '#dbe4ef',
  '#5c6b7f', '#ff8b96', '#7dffc8', '#ffd280', '#7fd3ff', '#dda5ea', '#8ee9f5', '#ffffff',
];

export function colorOf(v) {
  if (typeof v === 'string') return v;
  if (v < 0) return null;
  if (v < 16) return PALETTE[v];
  if (v < 232) {
    // 6×6×6 куб
    const n = v - 16;
    const r = Math.floor(n / 36);
    const g = Math.floor((n % 36) / 6);
    const b = n % 6;
    const s = (x) => (x === 0 ? 0 : 55 + x * 40);
    return `rgb(${s(r)},${s(g)},${s(b)})`;
  }
  const gray = 8 + (v - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

function cellCss(cell) {
  let fg = colorOf(cell.fg);
  let bg = colorOf(cell.bg);
  if (cell.inverse) {
    const t = fg || '#cdd9e5';
    fg = bg || '#060a0f';
    bg = t;
  }
  const css = [];
  if (fg) css.push(`color:${fg}`);
  if (bg) css.push(`background:${bg}`);
  if (cell.bold) css.push('font-weight:700');
  if (cell.dim) css.push('opacity:.65');
  if (cell.italic) css.push('font-style:italic');
  if (cell.underline) css.push('text-decoration:underline');
  return css.length ? css.join(';') : null;
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Клавиш от браузъра → последователност за PTY.
export function keyToSequence(e) {
  const k = e.key;
  if (e.ctrlKey && k.length === 1) {
    const code = k.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // Ctrl+A..Z
    if (k === '[') return '\x1b';
    if (k === ' ') return '\x00';
  }
  switch (k) {
    case 'Enter':
      return '\r';
    case 'Backspace':
      return '\x7f';
    case 'Tab':
      return '\t';
    case 'Escape':
      return '\x1b';
    case 'ArrowUp':
      return '\x1b[A';
    case 'ArrowDown':
      return '\x1b[B';
    case 'ArrowRight':
      return '\x1b[C';
    case 'ArrowLeft':
      return '\x1b[D';
    case 'Home':
      return '\x1b[H';
    case 'End':
      return '\x1b[F';
    case 'PageUp':
      return '\x1b[5~';
    case 'PageDown':
      return '\x1b[6~';
    case 'Delete':
      return '\x1b[3~';
    case 'Insert':
      return '\x1b[2~';
    default:
      return k.length === 1 ? k : null;
  }
}
