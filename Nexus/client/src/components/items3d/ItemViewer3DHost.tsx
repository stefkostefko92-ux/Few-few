// Монтира се веднъж (App.tsx). Държи ЕДИН WebGPU/WebGL renderer + canvas за целия живот на
// приложението — общ за прегледа на ЕДИН предмет И витрината на СЕТ (виж viewerStore.ts).
// Създаването на ВТОРИ успореден WebGL контекст на страницата е забелязано да чупи софтуерния
// WebGL backend (SwiftShader/llvmpipe, headless/CI) — един споделен контекст го избягва изцяло
// и е по-бързо на всеки следващ клик (не се пресъздава). Модалната „обвивка" (React) е нула
// тежест докато никой не е кликнал: самият three.js/generator код се зарежда лениво.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three/webgpu';
import { closeItemViewer3D, useItemViewer3DTarget } from './viewerStore';
import { hasBakedIcon } from './catalogClient';
import type { ViewerHandle, RendererHandle, StudioScene } from '../../combat/engine/items/renderScene';
import './itemViewer3d.css';

const RARITY_LABEL: Record<string, string> = {
  common: 'items3d.rarity.common', uncommon: 'items3d.rarity.uncommon', rare: 'items3d.rarity.rare',
  epic: 'items3d.rarity.epic', legendary: 'items3d.rarity.legendary',
};

const RING_RADIUS = 0.55;

export default function ItemViewer3DHost(): React.ReactElement {
  const { t } = useTranslation();
  const target = useItemViewer3DTarget();
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RendererHandle | null>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const builtRef = useRef<Array<{ dispose(): void }>>([]);
  const groupsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const rootRef = useRef<THREE.Object3D | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isolated, setIsolated] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setStatus('loading');
    setIsolated(null);

    (async () => {
      const [{ buildItem }, renderScene, { getCatalogEntry }] = await Promise.all([
        import('../../combat/engine/items/buildItem'),
        import('../../combat/engine/items/renderScene'),
        import('./catalogClient'),
      ]);
      if (cancelled) return;

      builtRef.current.forEach((b) => b.dispose());
      builtRef.current = [];
      groupsRef.current.clear();

      let sceneRoot: THREE.Object3D;
      if (target.kind === 'item') {
        const entry = await getCatalogEntry(target.slug, target);
        if (cancelled) return;
        const built = await buildItem(entry);
        if (cancelled) return;
        if (!built) { setStatus('error'); return; }
        builtRef.current.push(built);
        sceneRoot = built.object;
      } else {
        const root = new THREE.Group();
        // Само парчета с реална boy 3D геометрия (виж support.ts) влизат в пръстена —
        // пръстен/амулет/брадва/копие остават невидими тук, старата снимка им стига.
        const usable = target.pieces.filter((p) => !p.missing && hasBakedIcon(p.slug));
        const n = Math.max(1, usable.length);
        for (let i = 0; i < usable.length; i++) {
          const p = usable[i];
          const entry = await getCatalogEntry(p.slug, { tier: p.tier, rarity: p.rarity || 'common', category: p.category, sub_type: p.sub_type });
          if (cancelled) return;
          const built = await buildItem(entry);
          if (cancelled) return;
          if (!built) continue;
          builtRef.current.push(built);
          const holder = new THREE.Group();
          const a = (i / n) * Math.PI * 2;
          holder.position.set(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS);
          holder.add(built.object);
          root.add(holder);
          groupsRef.current.set(p.slug, holder);
        }
        sceneRoot = root;
      }
      rootRef.current = sceneRoot;

      if (!canvasRef.current && wrapRef.current) {
        const c = document.createElement('canvas');
        c.className = 'item3d-canvas';
        wrapRef.current.appendChild(c);
        canvasRef.current = c;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!rendererRef.current) {
        const forceWebGL = new URLSearchParams(location.search).has('webgl');
        try {
          rendererRef.current = await renderScene.createRenderer(canvas, { forceWebGL, alpha: true });
        } catch {
          if (!cancelled) setStatus('error');
          return;
        }
      }
      if (cancelled) return;

      const studio: StudioScene = renderScene.buildStudioScene(sceneRoot, {
        envMap: rendererRef.current.envMap,
        rarity: target.kind === 'item' ? target.rarity : undefined,
      });
      handleRef.current?.dispose({ keepRenderer: true });
      handleRef.current = renderScene.mountInteractiveViewer(canvas, rendererRef.current.renderer, studio, { autoRotate: true });
      setStatus('ready');
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.slug]);

  // „Изолирай парче" (само за set) — прекадрира около избраната част, без да пресъздава renderer.
  useEffect(() => {
    if (!target || target.kind !== 'set' || !rootRef.current || !handleRef.current) return;
    for (const [slug, holder] of groupsRef.current) holder.visible = !isolated || slug === isolated;
    const focus = isolated ? (groupsRef.current.get(isolated) ?? rootRef.current) : rootRef.current;
    handleRef.current.refit(focus, isolated ? 1.6 : 1.15);
  }, [isolated, target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeItemViewer3D(); return; }
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
  }, [target]);

  // Пълно унищожение само когато самият Host се размонтира (практически никога в SPA живота,
  // но пази коректност при HMR/тестове) — GPU контекстът живее толкова, колкото приложението.
  useEffect(() => () => {
    handleRef.current?.dispose();
    builtRef.current.forEach((b) => b.dispose());
  }, []);

  const isSet = target?.kind === 'set';
  const rarity = target?.kind === 'item' ? target.rarity : undefined;

  return (
    <div className={`item3d-overlay ${target ? '' : 'item3d-hidden'}`} onClick={closeItemViewer3D}>
      <div
        className={`item3d-dialog ${isSet ? 'set3d-dialog' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!target}
        aria-label={target ? t(isSet ? 'items3d.setViewerLabel' : 'items3d.viewerLabel', { name: target.name }) : undefined}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="item3d-close" onClick={closeItemViewer3D} aria-label={t('items3d.close')}>×</button>
        <div className={`item3d-canvas-wrap ${rarity ? `rarity-${rarity}` : ''}`} ref={wrapRef}>
          {status === 'loading' && <div className="item3d-status">{t('items3d.loading')}</div>}
          {status === 'error' && <div className="item3d-status">{t('items3d.unavailable')}</div>}
        </div>
        {target?.kind === 'item' && (
          <div className="item3d-info">
            <div className="item3d-name">{target.name}</div>
            <div className="item3d-meta">
              <span>{t('items3d.tier', { tier: target.tier })}</span>
              <span className={`item3d-rarity rarity-${target.rarity}`}>{t(RARITY_LABEL[target.rarity] || RARITY_LABEL.common)}</span>
            </div>
            <div className="item3d-hint">{t('items3d.dragHint')}</div>
          </div>
        )}
        {target?.kind === 'set' && (
          <div className="item3d-info">
            <div className="item3d-name">{target.name}</div>
            <div className="set3d-pieces">
              <button className={`set3d-piece-btn ${!isolated ? 'active' : ''}`} onClick={() => setIsolated(null)}>{t('items3d.setViewer.all')}</button>
              {target.pieces.filter((p) => !p.missing && hasBakedIcon(p.slug)).map((p) => (
                <button key={p.slug} className={`set3d-piece-btn ${isolated === p.slug ? 'active' : ''}`} onClick={() => setIsolated(p.slug)}>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="item3d-hint">{t('items3d.dragHint')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
