// Модал с жив, въртящ се 3D преглед на един предмет. Lazy chunk (виж ItemViewer3DHost.tsx) —
// нула тежест докато никой не кликне предмет. Фокус капан + Esc + пълно почистване при затваряне
// (GPU памет, слушатели, rAF) — виж combat/engine/items/renderScene.ts.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildItem } from '../../combat/engine/items/buildItem';
import { buildStudioScene, createRenderer, mountInteractiveViewer } from '../../combat/engine/items/renderScene';
import type { ViewerHandle } from '../../combat/engine/items/renderScene';
import { getCatalogEntry } from './catalogClient';
import type { ViewerTarget } from './viewerStore';
import './itemViewer3d.css';

const RARITY_LABEL: Record<string, string> = {
  common: 'items3d.rarity.common', uncommon: 'items3d.rarity.uncommon', rare: 'items3d.rarity.rare',
  epic: 'items3d.rarity.epic', legendary: 'items3d.rarity.legendary',
};

export default function ItemViewer3DModal({ target, onClose }: { target: ViewerTarget; onClose: () => void }): React.ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let handle: ViewerHandle | null = null;
    let dispose3D: (() => void) | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      try {
        const entry = await getCatalogEntry(target.slug, target);
        const built = buildItem(entry);
        dispose3D = built.dispose;
        const studio = buildStudioScene(built.object);
        const forceWebGL = new URLSearchParams(location.search).has('webgl');
        const { renderer } = await createRenderer(canvas, { forceWebGL, alpha: true });
        if (cancelled) { renderer.dispose(); built.dispose(); return; }
        handle = mountInteractiveViewer(canvas, renderer, studio, { autoRotate: true });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      handle?.dispose();
      dispose3D?.();
    };
  }, [target.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const closeBtn = dialogRef.current?.querySelector<HTMLButtonElement>('.item3d-close');
    closeBtn?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="item3d-overlay" onClick={onClose}>
      <div
        className="item3d-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('items3d.viewerLabel', { name: target.name })}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="item3d-close" onClick={onClose} aria-label={t('items3d.close')}>×</button>
        <div className={`item3d-canvas-wrap rarity-${target.rarity}`}>
          <canvas ref={canvasRef} className="item3d-canvas" />
          {status === 'loading' && <div className="item3d-status">{t('items3d.loading')}</div>}
          {status === 'error' && <div className="item3d-status">{t('items3d.unavailable')}</div>}
        </div>
        <div className="item3d-info">
          <div className="item3d-name">{target.name}</div>
          <div className="item3d-meta">
            <span>{t('items3d.tier', { tier: target.tier })}</span>
            <span className={`item3d-rarity rarity-${target.rarity}`}>{t(RARITY_LABEL[target.rarity] || RARITY_LABEL.common)}</span>
          </div>
          <div className="item3d-hint">{t('items3d.dragHint')}</div>
        </div>
      </div>
    </div>
  );
}
