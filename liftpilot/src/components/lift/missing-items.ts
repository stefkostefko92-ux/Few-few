// The values of the one form still to enter as its missing list names them, each with the field it links to: the
// project's (src/lib/lift/blank.ts) by the form's own labels, the calculation's by the calculator's.
import { isBlankKey, type BlankKey } from '@/lib/lift/blank';
import type { Floor } from '@/shaft';
import { fieldId } from '../blank';

type Tr = (key: string, values?: Record<string, string | number>) => string;

export interface MissingNames {
  shaft: Tr;
  blank: Tr;
  lift: Tr;
  /** a calculation's field by its id */
  calc(id: string): string;
}

function labelOf(k: BlankKey, floors: readonly Floor[], n: MissingNames): string {
  const [head = k, sub = ''] = k.split('.'), floor = (i: number): string => floors[i]?.label ?? String(i);
  switch (head) {
    case 'Q': return n.shaft('Qmode');
    case 'Qkg': return n.shaft('Q');
    case 'v': case 'pit': case 'headroom': return n.shaft(`vt_${head}`);
    case 'floors': return n.blank('count');
    case 'rise': return n.blank('rise', { from: floor(Number(sub)), to: floor(Number(sub) + 1) });
    case 'fdoor': return n.blank('floorDoor', { floor: floor(Number(sub)) });
    case 'main': return n.blank('main');
    case 'bottom': return n.lift('bottom_scheme');
    case 'room': return n.shaft(`rm_${sub}`);
    case 'r': case 'layout': return n.calc(head);
    default: return n.shaft(head);
  }
}

export function missingItems(keys: readonly string[], floors: readonly Floor[], names: MissingNames): { id: string; label: string }[] {
  return keys.map((k) => (isBlankKey(k) ? { id: fieldId(k), label: labelOf(k, floors, names) } : { id: k, label: names.calc(k) }));
}
