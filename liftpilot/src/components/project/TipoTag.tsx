import type { IconName } from '@/components/icon-names';
import { TIPI_INTERVENTO, type TipoIntervento } from '@/lib/lift/intervento';

/** The icon of an installation by its type of intervention (round 45): the machine alone, the lift, none yet. */
export const iconaTipo = (tipo: TipoIntervento | null): IconName => (tipo === 'SOLO_ARGANO' ? 'motor' : tipo ? 'elevator' : 'clipboard-list');

/** An installation's type of intervention as a tag, with the rising scale of «Calcolo argano» (how much of the lift the
 *  test takes in); none yet — «Intervento da definire», dashed. `label`: the type's name as the page writes it. */
export default function TipoTag({ tipo, label, small = false }: { tipo: TipoIntervento | null; label: string; small?: boolean }) {
  const i = tipo ? TIPI_INTERVENTO.indexOf(tipo) : -1;
  return (
    <span className={small ? 'tipo-badge sm' : 'tipo-badge'} data-tipo={tipo ?? 'none'}>
      <span className="tipo-scala" aria-hidden="true">{[0, 1, 2].map((s) => <i key={s} className={s <= i ? 'piena' : undefined} />)}</span>
      {label}
    </span>
  );
}
