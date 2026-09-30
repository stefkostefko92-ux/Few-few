import { notFound } from 'next/navigation';

// Unknown address under a language: the localized 404.
export default function CatchAll(): never {
  notFound();
}
