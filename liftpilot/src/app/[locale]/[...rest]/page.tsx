import { notFound } from 'next/navigation';

// Unknown address under /it: the 404 in Italian.
export default function CatchAll(): never {
  notFound();
}
