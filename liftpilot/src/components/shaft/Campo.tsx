// The fields of the Progetto's and the machine room's forms with their «?» (round 52, components/aiuto). Campo is a field
// as the label wrapper drew it (.field, .need while still to enter) whose name is a label for the control beside the «?»
// — never a «?» inside the label, which names its control alone. ConAiuto puts the «?» after something that is not a
// field's name: a checkbox's label, a heading, a column's header, a control with no visible name.
import type { ReactNode } from 'react';
import Aiuto from '../aiuto/Aiuto';
import Etichetta from '../aiuto/Etichetta';

interface CampoProps {
  /** the control's id the label is for */
  id: string;
  /** the field's name as words (the «?» says it) */
  nome: string;
  aiuto: string | null;
  /** the label's content when it is more than the name (a badge, «dal rilievo») */
  label?: ReactNode;
  need?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Campo({ id, nome, aiuto, label, need = false, className, children }: CampoProps) {
  return (
    <div className={`field${need ? ' need' : ''}${className ? ` ${className}` : ''}`}>
      <Etichetta htmlFor={id} aiuto={aiuto} nome={nome}>{label ?? nome}</Etichetta>
      {children}
    </div>
  );
}

/** `children` with the «?» after it, together in the box the explanation opens under (a block one around a heading). */
export function ConAiuto({ aiuto, nome, block = false, className, children }: {
  aiuto: string | null; nome: string; block?: boolean; className?: string; children?: ReactNode;
}) {
  if (!aiuto) return <>{children}</>;
  const cls = `lbl${className ? ` ${className}` : ''}`;
  return block
    ? <div className={cls}>{children}<Aiuto testo={aiuto} nome={nome} /></div>
    : <span className={cls}>{children}<Aiuto testo={aiuto} nome={nome} /></span>;
}
