// A field's label with its «?» (round 52): the label as it was, and next to it the explanation of the field (Aiuto.tsx).
// Without a text it is the bare label, so a page renders the same where the guide has nothing to add. Used by server
// and client components alike; `nome` is the field's name as words (the label's children may be markup).
import type { ReactNode } from 'react';
import Aiuto from './Aiuto';

interface Props {
  htmlFor?: string;
  /** the explanation; null or '' — no «?» */
  aiuto: string | null | undefined;
  nome: string;
  className?: string;
  id?: string;
  children: ReactNode;
}

export default function Etichetta({ htmlFor, aiuto, nome, className, id, children }: Props) {
  const label = <label htmlFor={htmlFor} className={className} id={id}>{children}</label>;
  if (!aiuto) return label;
  return <span className="lbl">{label}<Aiuto testo={aiuto} nome={nome} /></span>;
}
