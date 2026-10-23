import type { ReactNode } from 'react';
import '@/app/rilievi.css';
import '@/app/rilievi-form.css';
import '@/app/rilievi-print.css';

// The survey sheets (Rilievi, round 41): their pages share the workspace's shell (the app's layout) and these sheets —
// the lists, the sheet and its plate, the form, the A4 paper.
export default function RilieviLayout({ children }: { children: ReactNode }) {
  return children;
}
