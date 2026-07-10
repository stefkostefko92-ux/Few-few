// Споделен достъп до Lenis инстанцията + помощник за скрол към секция по id.
import type Lenis from 'lenis';

let instance: Lenis | null = null;

export function setLenis(l: Lenis | null): void {
  instance = l;
}

export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (instance) {
    instance.scrollTo(el, { offset: -70, duration: 1.2 });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function scrollTop(): void {
  if (instance) instance.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
