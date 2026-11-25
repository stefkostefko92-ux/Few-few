import { notFound } from 'next/navigation';

// Непознат път под езика (/bg/липсва) → локализираната 404 на [locale]/not-found.tsx,
// не общата двуезична (визуалният обход).
export default function UnknownLocalePath(): never {
  notFound();
}
