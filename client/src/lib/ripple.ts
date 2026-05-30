/**
 * Click ripple — adds a radial wave from the pointer position on any
 * element that has class .ripple or .btn. Mount once at the app root.
 */

export function installGlobalRipple(): () => void {
  function onPointerDown(e: PointerEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const target = t.closest('.btn, .ripple, .nav-link, .sidebar-item, .guild-tab') as HTMLElement | null;
    if (!target) return;
    if ((target as any).disabled) return;
    if (target.dataset.noRipple === 'true') return;

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const span = document.createElement('span');
    span.className = 'click-ripple';
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;

    // Make sure host can clip the ripple
    const cs = window.getComputedStyle(target);
    if (cs.position === 'static') target.style.position = 'relative';
    if (cs.overflow !== 'hidden' && cs.overflow !== 'clip') target.style.overflow = 'hidden';

    target.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  }
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  return () => document.removeEventListener('pointerdown', onPointerDown);
}
