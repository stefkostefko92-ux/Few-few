// „Витрина" на цял сет — всички парчета подредени в кръг около общ пивот, бавно въртене,
// с превключване (isolate) на едно парче за детайлен преглед. По-надежден вариант от пълно
// обличане на боец в тази итерация (генераторът стои сам, без рига на fighter.js) — виж
// договора/бележките в доклада за следваща стъпка.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three/webgpu';
import { buildItem } from '../../combat/engine/items/buildItem';
import { buildStudioScene, createRenderer, mountInteractiveViewer } from '../../combat/engine/items/renderScene';
import type { ViewerHandle } from '../../combat/engine/items/renderScene';
import { getCatalogEntry } from './catalogClient';
import './itemViewer3d.css';

export interface SetPiece { slug: string; name: string; category: string; sub_type?: string; tier: number; rarity?: string; missing?: boolean }
export interface SetTarget { kind: 'set'; slug: string; name: string; tier: number; pieces: SetPiece[] }

const RING_RADIUS = 0.55;

export default function SetViewer3DModal({ target, onClose }: { target: SetTarget; onClose: () => void }): React.ReactElement {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isolated, setIsolated] = useState<string | null>(null);
  const groupsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const rootRef = useRef<THREE.Object3D | null>(null);
  const handleRef = useRef<ViewerHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: ViewerHandle | null = null;
    const disposers: Array<() => void> = [];
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      try {
        const usable = target.pieces.filter((p) => !p.missing);
        const root = new THREE.Group();
        const n = Math.max(1, usable.length);
        for (let i = 0; i < usable.length; i++) {
          const p = usable[i];
          const entry = await getCatalogEntry(p.slug, { tier: p.tier, rarity: p.rarity || 'common', category: p.category, sub_type: p.sub_type });
          const built = buildItem(entry);
          disposers.push(built.dispose);
          const holder = new THREE.Group();
          const a = (i / n) * Math.PI * 2;
          holder.position.set(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS);
          holder.add(built.object);
          root.add(holder);
          groupsRef.current.set(p.slug, holder);
        }
        rootRef.current = root;
        const studio = buildStudioScene(root);
        const forceWebGL = new URLSearchParams(location.search).has('webgl');
        const { renderer } = await createRenderer(canvas, { forceWebGL, alpha: true });
        if (cancelled) { renderer.dispose(); disposers.forEach((d) => d()); return; }
        handle = mountInteractiveViewer(canvas, renderer, studio, { autoRotate: true });
        handleRef.current = handle;
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
      disposers.forEach((d) => d());
      groupsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.slug]);

  useEffect(() => {
    if (!rootRef.current || !handleRef.current) return;
    for (const [slug, holder] of groupsRef.current) holder.visible = !isolated || slug === isolated;
    const focus = isolated ? (groupsRef.current.get(isolated) ?? rootRef.current) : rootRef.current;
    handleRef.current.refit(focus, isolated ? 1.6 : 1.15);
  }, [isolated]);

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
    dialogRef.current?.querySelector<HTMLButtonElement>('.item3d-close')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="item3d-overlay" onClick={onClose}>
      <div className="item3d-dialog set3d-dialog" role="dialog" aria-modal="true" aria-label={t('items3d.setViewerLabel', { name: target.name })} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <button className="item3d-close" onClick={onClose} aria-label={t('items3d.close')}>×</button>
        <div className="item3d-canvas-wrap">
          <canvas ref={canvasRef} className="item3d-canvas" />
          {status === 'loading' && <div className="item3d-status">{t('items3d.loading')}</div>}
          {status === 'error' && <div className="item3d-status">{t('items3d.unavailable')}</div>}
        </div>
        <div className="item3d-info">
          <div className="item3d-name">{target.name}</div>
          <div className="set3d-pieces">
            <button className={`set3d-piece-btn ${!isolated ? 'active' : ''}`} onClick={() => setIsolated(null)}>{t('items3d.setViewer.all')}</button>
            {target.pieces.filter((p) => !p.missing).map((p) => (
              <button key={p.slug} className={`set3d-piece-btn ${isolated === p.slug ? 'active' : ''}`} onClick={() => setIsolated(p.slug)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="item3d-hint">{t('items3d.dragHint')}</div>
        </div>
      </div>
    </div>
  );
}
