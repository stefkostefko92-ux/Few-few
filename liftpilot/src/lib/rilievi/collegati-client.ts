// The linked data in the browser (the list: ordini/collegamenti-elenco.ts, handed to the form as plain data by
// collegati-browser.ts): the same plant data in the sheet and in the suppliers' modules. A place nobody has typed in
// follows the others in real time, in every direction — empty, or still holding what was put there for it (`auto`): a
// module takes what the sheet says, the sheet what a module says, one module the other. A place someone typed in keeps its
// value; places that say different things are listed under their group, and the server asks to confirm them on save.
// Pure: the rules of rilievi's public/js/collegati.js (commit 988f3cf37) over an adapter of the form's controls, so the
// component plugs the DOM (or React state) and the tests plug plain objects. The server fills a module when it first opens
// and checks on save (ordini/form.ts, ordini/collegati.ts) — this only shows.
//
// How the form uses it (rilievi's order of events): after every input or change the person makes, mark that control
// touched (`touch`), let the conditions and the rows per stop follow, refill the modules' survey fields
// (prefill-client.ts), then `settle`: it fills the following places and calls `notify` with the controls of the sheet it
// changed — the form tells the page about them as typing would (its conditions, the rows per stop, the survey fields), and
// those events are its own: they must not mark anything touched nor settle again. On load: `settle` once. On submit: put
// `followingNames()` in the hidden input `collegati-auto` (AUTO_KEY), so a form that comes back keeps them following.
import type { Luogo } from './ordini/collegamenti';
import type { CollegatiDati, GruppoBrowser, MembroBrowser } from './ordini/collegati-browser';
import { forSheet, optionFor, pairOf, same, splitPair } from './valori-client';

/** A control of the form — an input, a select or a textarea (a DOM element fits as it is). `dataset.auto` is rilievi's
 *  data-auto (the value put there for it), `dataset.touched` = '1' once the person changed it, `dataset.predefinito` is
 *  set on the radio button of the blank module's own answer, `dataset.scritto` on a survey field of a module the person
 *  emptied (prefill-client.ts — rilievi's data-scritto, commit 988f3cf37). */
export interface Ctl {
  readonly name: string;
  /** 'checkbox' | 'radio' | 'text' | 'select-one' | 'textarea' … */
  readonly type: string;
  value: string;
  checked?: boolean;
  /** an input's or a textarea's maxlength (-1 or 0: none) */
  readonly maxLength?: number;
  readonly dataset: { auto?: string; touched?: string; predefinito?: string; scritto?: string };
}

/** What the engine asks the form. */
export interface CollegatiHost<E extends Ctl> {
  /** every control with this name, in page order */
  byName(name: string): E[];
  /** the sheet's tick `name` = `value` (an input), or null */
  tickOf(name: string, value: string): E | null;
  /** shown: not inside anything hidden (rilievi: `!el.closest('[data-off]')` — a field off by its condition, a closed
   *  module, a module of another make) */
  shown(el: E): boolean;
  /** for a control of a module: whether its module's own box is open (its question says «Sì»), even when its make's
   *  wrapper hides it; null for a control of the sheet */
  moduloOpen(el: E): boolean | null;
  /** a tick's words as its label reads («Automatiche», «2», «Doppio Ingresso») */
  labelOf(el: E): string;
  /** a select's option values ('' for «—» included), or null when the control is not a select */
  optionsOf(el: E): readonly string[] | null;
  /** every control that carries `dataset.auto` (rilievi: `[data-auto]`), in page order */
  autoControls(): E[];
}

type Kind = 'pair' | 'map' | 'text' | 'radio' | 'boxes';

interface Place<E extends Ctl> {
  group: GruppoBrowser;
  m: MembroBrowser;
  sheet: boolean;
  els: E[];
  kind: Kind;
  /** one field may sit in two groups (the sheet's «Accessi»): its id is the same in both */
  id: string;
}

/** A discrepancy as it is on screen: the group, its name and what each shown place says. */
export interface ClientDiscrepanza {
  key: string;
  nome: string;
  voci: { luogo: Luogo; valore: string }[];
}

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
const nameOf = (m: MembroBrowser, key: string): string => (m.luogo === 'scheda' ? key : `${m.luogo}-${key}`);
const isTick = (el: Ctl): boolean => el.type === 'checkbox' || el.type === 'radio';
const touched = (el: Ctl): boolean => el.dataset.touched === '1';

export function collegatiEngine<E extends Ctl>(data: CollegatiDati, host: CollegatiHost<E>) {
  const voci = (m: MembroBrowser): Readonly<Record<string, string>> => ('voci' in m ? m.voci : {});
  const valoriOf = (m: MembroBrowser): Readonly<Record<string, string>> => ('valori' in m && m.valori ? m.valori : {});
  const campoOf = (m: MembroBrowser): string | undefined => ('campo' in m ? m.campo : undefined);

  const placeOf = (group: GruppoBrowser, m: MembroBrowser): Place<E> | null => {
    const sheet = m.luogo === 'scheda';
    const campo = campoOf(m);
    let els: E[];
    let kind: Kind | null;
    if (group.tipo === 'numero' && 'campi' in m) {
      els = m.campi.map((key) => host.byName(nameOf(m, key))[0]).filter((el): el is E => el !== undefined);
      kind = els.length === 2 ? 'pair' : null;
    } else if (group.tipo === 'numero' && campo !== undefined) {
      els = host.byName(nameOf(m, campo));
      kind = !els.length ? null : els[0]?.type === 'radio' ? 'map' : 'text';
    } else if (!sheet && campo !== undefined) {
      els = host.byName(nameOf(m, campo));
      kind = 'radio';
    } else {
      els = Object.keys(voci(m))
        .map((key) => (sheet && campo !== undefined ? host.tickOf(campo, key) : (host.byName(`${m.luogo}-${key}`).find(isTick) ?? null)))
        .filter((el): el is E => el !== null);
      kind = 'boxes';
    }
    const id = sheet && campo !== undefined ? campo : `${m.luogo}-${campo ?? ('campi' in m ? m.campi : Object.keys(voci(m))).join()}`;
    return kind && els.length ? { group, m, sheet, els, kind, id } : null;
  };
  // the places are looked up at every round: a module the person opens is on the page already, only hidden
  const groupsNow = () => data.gruppi.map((group) => ({ group, places: group.membri.map((m) => placeOf(group, m)).filter((p): p is Place<E> => p !== null) }));

  const keyOf = (p: Place<E>, el: E): string => (p.sheet || p.kind === 'radio' ? el.value : el.name.slice(p.m.luogo.length + 1));
  const ticked = (p: Place<E>): E[] => p.els.filter((el) => el.checked === true && hasOwn(voci(p.m), keyOf(p, el)));
  /** What a place says: text for a number group, categories for a choice; null — nothing. */
  const read = (p: Place<E>): string | Set<string> | null => {
    if (p.kind === 'pair') {
      const [a, b] = p.els;
      return pairOf(a?.value.trim() ?? '', b?.value.trim() ?? '') || null;
    }
    if (p.kind === 'map') {
      // only the map's own keys: «constructor» from a tampered form is not an answer
      const box = p.els.find((el) => el.checked === true);
      const valori = valoriOf(p.m);
      return box && hasOwn(valori, box.value) ? (valori[box.value] ?? null) : null;
    }
    if (p.kind === 'text') return p.els[0]?.value.trim() || null;
    const boxes = ticked(p);
    return boxes.length ? new Set(boxes.map((el) => voci(p.m)[keyOf(p, el)] ?? '')) : null;
  };

  // Hidden says nothing: a field whose condition is off, a module whose question is not «Sì». Filling is the one
  // exception: the other make's module of the same column (Pelazza ↔ MoviLift), hidden only by the make while the question
  // still says «Sì», lends what it says to its twin — that is how the order carries over when the make changes. It is never
  // a difference: the server reads the open one.
  const visibleFor = (p: Place<E>, target: Place<E>): boolean => {
    const [first] = p.els;
    if (!first) return false;
    if (host.shown(first)) return true;
    if (p.sheet || target.sheet || data.colonne[p.m.luogo as keyof typeof data.colonne] !== data.colonne[target.m.luogo as keyof typeof data.colonne]) return false;
    return host.moduloOpen(first) === true;
  };

  /** A place follows while nobody has typed in it: empty, or still what was put there for it. */
  const follows = (p: Place<E>): boolean =>
    !p.els.some(touched) && p.els.every((el) => (isTick(el) ? el.checked !== true || el.dataset.auto === 'si' : el.value === '' || el.value === el.dataset.auto));

  // writing into a following place; the controls that changed come back (the sheet's get events)
  const setText = (el: E, value: string): boolean => {
    const before = el.value;
    el.value = value;
    el.dataset.auto = el.value;
    return el.value !== before;
  };
  const setTick = (el: E, on: boolean): boolean => {
    const changed = el.checked !== on;
    el.checked = on;
    el.dataset.auto = on ? 'si' : '';
    return changed;
  };
  const write = (p: Place<E>, value: string | Set<string> | null): E[] => {
    if (p.kind === 'pair') {
      const parts = splitPair(typeof value === 'string' ? value : '');
      return p.els.filter((el, i) => setText(el, parts[i] ?? ''));
    }
    if (p.kind === 'map') {
      const valori = valoriOf(p.m);
      const key = typeof value === 'string' && value ? Object.keys(valori).find((k) => same(valori[k] ?? '', value)) : undefined;
      return p.els.filter((el) => setTick(el, el.value === key));
    }
    if (p.kind === 'text') {
      const [el] = p.els;
      if (!el) return [];
      const text = typeof value === 'string' ? value : '';
      const options = host.optionsOf(el);
      const max = el.maxLength !== undefined && el.maxLength > 0 ? el.maxLength : undefined;
      const next = options ? optionFor(options, text) : p.sheet ? forSheet(p.m as Extract<MembroBrowser, { luogo: 'scheda' }>, text) : text.slice(0, max);
      return setText(el, next) ? [el] : [];
    }
    const wanted = new Set<string>();
    const categories = value instanceof Set ? value : new Set<string>();
    for (const category of categories) {
      const keys = Object.keys(voci(p.m)).filter((key) => voci(p.m)[key] === category);
      const [firstKey] = keys;
      // a radio has one answer: only for one category over there, and its first button here; a category ticks a box only
      // when exactly one box means it
      if (p.kind === 'radio' && categories.size === 1 && firstKey !== undefined) wanted.add(firstKey);
      if (p.kind !== 'radio' && keys.length === 1 && firstKey !== undefined) wanted.add(firstKey);
    }
    // nothing said elsewhere: a radio goes back to the blank module's own answer, if it has one
    const fallback = p.kind === 'radio' && !wanted.size ? p.els.find((el) => el.dataset.predefinito !== undefined) : undefined;
    return p.els.filter((el) => setTick(el, el === fallback || wanted.has(keyOf(p, el))));
  };

  /**
   * Every following place takes the first place that says something — someone's own value before one filled in this
   * round, which carries a value from one group to the next (a module → the sheet's «Accessi» → the other module).
   * Followers nobody speaks for are emptied. Returns the controls that changed.
   */
  const fill = (): E[] => {
    const groups = groupsNow();
    const followers = new Set<string>();
    groups.forEach(({ places }) => places.forEach((p) => follows(p) && followers.add(p.id)));
    const done = new Set<string>();
    const changed: E[] = [];
    const speaks = (p: Place<E>): boolean => !followers.has(p.id) || done.has(p.id);
    for (let pass = 0, progress = true; progress && pass < 6; pass += 1) {
      progress = false;
      for (const { places } of groups) {
        for (const target of places) {
          if (!followers.has(target.id) || done.has(target.id)) continue;
          const sources = places.filter((p) => p !== target && speaks(p) && visibleFor(p, target));
          const ordered = [...sources.filter((p) => !followers.has(p.id)), ...sources.filter((p) => followers.has(p.id))];
          const value = ordered.map(read).find((v) => v !== null);
          if (value === undefined) continue;
          changed.push(...write(target, value));
          done.add(target.id);
          progress = true;
        }
      }
    }
    groups.forEach(({ places }) =>
      places.forEach((target) => {
        if (!followers.has(target.id) || done.has(target.id)) return;
        changed.push(...write(target, null));
        done.add(target.id);
      }),
    );
    return changed;
  };

  /** What disagrees now: different numbers, or ticked boxes with no category in common — shown places only. */
  const discrepanze = (): ClientDiscrepanza[] => {
    const out: ClientDiscrepanza[] = [];
    for (const { group, places } of groupsNow()) {
      if (!group.confronto) continue;
      const parts = places
        .filter((p) => p.els[0] !== undefined && host.shown(p.els[0]))
        .map((p) => ({ p, said: read(p) }))
        .flatMap(({ p, said }) => (said === null ? [] : [{ p, said }]));
      if (parts.length < 2) continue;
      const first = parts[0];
      const differs = group.tipo === 'numero'
        ? parts.some((part) => !same(String(part.said), String(first?.said ?? '')))
        : parts.some((a, i) => parts.slice(i + 1).some((b) => ![...(a.said as Set<string>)].some((c) => (b.said as Set<string>).has(c))));
      if (!differs) continue;
      out.push({
        key: group.key,
        nome: group.nome,
        voci: parts.map(({ p, said }) => ({ luogo: p.m.luogo, valore: group.tipo === 'numero' ? String(said) : ticked(p).map((el) => host.labelOf(el)).join(', ') })),
      });
    }
    return out;
  };

  return {
    /** The person changed this control: from now on it is theirs — it stops following. */
    touch(el: E): void {
      el.dataset.touched = '1';
    },
    fill,
    /**
     * A few rounds of filling: the sheet's controls filled here are handed to `notify` (the form tells the page about them
     * as typing would — its conditions, the rows per stop, the modules' survey fields — and what they show can speak in
     * turn), then the discrepancies on screen. `notify` must not mark anything touched.
     */
    settle(notify: (sheetControls: E[]) => void): ClientDiscrepanza[] {
      for (let round = 0; round < 3; round += 1) {
        const sheet = fill().filter((el) => host.moduloOpen(el) === null);
        if (!sheet.length) break;
        notify(sheet);
      }
      return discrepanze();
    },
    discrepanze,
    /** The discrepancies of the links in `keys` (a module group's `diff`, ordini/form.ts ModuloSpec), in that order. */
    delGruppo(found: readonly ClientDiscrepanza[], keys: readonly string[]): ClientDiscrepanza[] {
      return keys.map((key) => found.find((d) => d.key === key)).filter((d): d is ClientDiscrepanza => d !== undefined);
    },
    /** The names still following — linked here or the modules' survey fields (prefill-client.ts) — for the hidden input
     *  `collegati-auto` on submit: if the form comes back (an error, the confirmation), the server marks them again. */
    followingNames(): string[] {
      const names = new Set(host.autoControls().map((el) => el.name));
      return [...names].filter((name) => {
        const els = host.byName(name);
        return !els.some(touched)
          && els.some((el) => (isTick(el) ? el.checked === true : el.value !== ''))
          && els.every((el) => (isTick(el) ? el.checked !== true || el.dataset.auto === 'si' : el.value === el.dataset.auto));
      });
    },
  };
}

export type CollegatiEngine<E extends Ctl> = ReturnType<typeof collegatiEngine<E>>;
