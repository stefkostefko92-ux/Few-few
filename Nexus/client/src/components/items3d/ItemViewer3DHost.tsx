// Монтира се веднъж (App.tsx). Държи ЕДИН WebGPU/WebGL renderer + canvas за целия живот на
// приложението — общ за прегледа на ЕДИН предмет И витрината на СЕТ (виж viewerStore.ts).
// Създаването на ВТОРИ успореден WebGL контекст на страницата е забелязано да чупи софтуерния
// WebGL backend (SwiftShader/llvmpipe, headless/CI) — един споделен контекст го избягва изцяло
// и е по-бързо на всеки следващ клик (не се пресъздава). Модалната „обвивка" (React) е нула
// тежест докато никой не е кликнал: самият three.js/generator код се зарежда лениво.
//
// Три режима на показ (виж support.ts previewMode):
//   'standalone' — предметът сам (шлем/ръкавица/щит/оръжие), оръжие/лък/жезъл диагонално
//                  завъртяни (~40°) и кадрирани по проектирания правоъгълник — тънка линия иначе
//                  губи кадъра.
//   'mannequin'  — облечен на рицарски манекен (броня/ботуши/наметало — сами по себе си четяха
//                  се двусмислено извън тяло), камерата кадрирана само около частта.
//   'icon'       — boy няма геометрия (пръстен/амулет/брадва·копие/качулка·маска·корона) →
//                  голяма стара снимка, честно, без 3D.
// Витрината на сет винаги показва ЦЕЛИЯ рицар, облечен в наличните парчета — най-силният showcase.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three/webgpu';
import { closeItemViewer3D, useItemViewer3DTarget } from './viewerStore';
import { resolveIconSlug } from './iconSlug';
import { previewMode, DIAGONAL_WEAPON_ICONS } from '../../combat/engine/items/support';
import { rngFor } from '../../combat/engine/items/rng';
import type { ViewerHandle, RendererHandle, StudioScene } from '../../combat/engine/items/renderScene';
import type { CatalogEntry } from '../../combat/engine/items/theme';
import './itemViewer3d.css';

const RARITY_LABEL: Record<string, string> = {
  common: 'items3d.rarity.common', uncommon: 'items3d.rarity.uncommon', rare: 'items3d.rarity.rare',
  epic: 'items3d.rarity.epic', legendary: 'items3d.rarity.legendary',
};

const SET_PIECE_CATEGORIES = ['helm', 'armor', 'gloves', 'boots', 'weapon', 'shield', 'cloak'];

export default function ItemViewer3DHost(): React.ReactElement {
  const { t } = useTranslation();
  const target = useItemViewer3DTarget();
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RendererHandle | null>(null);
  const handleRef = useRef<ViewerHandle | null>(null);
  const builtRef = useRef<Array<{ dispose(): void }>>([]);
  const rootRef = useRef<THREE.Object3D | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [iconSrc, setIconSrc] = useState<string | null>(null);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [setButtons, setSetButtons] = useState<{ cat: string; label: string }[]>([]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setStatus('loading');
    setIsolated(null);
    setIconSrc(null);
    setSetButtons([]);

    (async () => {
      const [{ buildItem }, { buildMannequin, buildDressedKnight }, renderScene, { getCatalogEntry }] = await Promise.all([
        import('../../combat/engine/items/buildItem'),
        import('../../combat/engine/items/mannequin'),
        import('../../combat/engine/items/renderScene'),
        import('./catalogClient'),
      ]);
      if (cancelled) return;

      builtRef.current.forEach((b) => b.dispose());
      builtRef.current = [];

      let sceneRoot: THREE.Object3D | null = null;
      let tiltDeg = 0;

      if (target.kind === 'item') {
        const entry = await getCatalogEntry(target.slug, target);
        if (cancelled) return;
        const mode = previewMode(entry);
        if (mode === 'icon') {
          setIconSrc(`/assets/icons/${resolveIconSlug(undefined, entry.category, entry.sub_type, entry.tier)}.jpg`);
          setStatus('ready');
          return;
        }
        if (mode === 'standalone') {
          const built = await buildItem(entry);
          if (cancelled) return;
          if (!built) { setStatus('error'); return; }
          builtRef.current.push(built);
          sceneRoot = built.object;
          if (entry.category === 'weapon' && DIAGONAL_WEAPON_ICONS.has(entry.icon || entry.sub_type || 'sword')) tiltDeg = 40;
        } else {
          const built = await buildMannequin(entry, rngFor(entry.slug));
          if (cancelled) return;
          builtRef.current.push(built);
          sceneRoot = built.object;
        }
      } else {
        const entries: CatalogEntry[] = [];
        for (const p of target.pieces) {
          if (p.missing) continue;
          const e = await getCatalogEntry(p.slug, { tier: p.tier, rarity: p.rarity || 'common', category: p.category, sub_type: p.sub_type });
          if (cancelled) return;
          entries.push(e);
        }
        const built = await buildDressedKnight(entries);
        if (cancelled) return;
        builtRef.current.push(built);
        sceneRoot = built.object;
        setSetButtons(
          entries
            .filter((e) => SET_PIECE_CATEGORIES.includes(e.category) && (e.category !== 'weapon' || previewMode(e) === 'standalone'))
            .map((e) => ({ cat: e.category, label: e.name })),
        );
      }
      if (!sceneRoot) return;
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
        tiltDeg,
      });
      handleRef.current?.dispose({ keepRenderer: true });
      handleRef.current = renderScene.mountInteractiveViewer(canvas, rendererRef.current.renderer, studio, { autoRotate: true });
      setStatus('ready');
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.slug]);

  // „Изолирай парче" (само за set) — прекадрира около всички mesh-ове/групи, маркирани с тази
  // категория (виж mannequin.ts userData.pieceCategory), без да пресъздава renderer-а или да
  // крие останалата част от рицаря (той стои неподвижен наоколо, за контекст).
  useEffect(() => {
    if (!target || target.kind !== 'set' || !rootRef.current || !handleRef.current) return;
    if (!isolated) { handleRef.current.refit(rootRef.current, 1.15); return; }
    const matches: THREE.Object3D[] = [];
    rootRef.current.traverse((o) => { if (o.userData.pieceCategory === isolated) matches.push(o); });
    handleRef.current.refit(matches.length ? matches : rootRef.current, 1.6);
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
  const showCanvas = status !== 'loading' && !iconSrc;

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
        <div className={`item3d-canvas-wrap ${rarity ? `rarity-${rarity}` : ''}`} ref={wrapRef} style={{ display: showCanvas ? undefined : 'flex', alignItems: iconSrc ? 'center' : undefined, justifyContent: iconSrc ? 'center' : undefined }}>
          {status === 'loading' && <div className="item3d-status">{t('items3d.loading')}</div>}
          {status === 'error' && <div className="item3d-status">{t('items3d.unavailable')}</div>}
          {iconSrc && <img className="item3d-icon-fallback" src={iconSrc} alt="" />}
        </div>
        {target?.kind === 'item' && (
          <div className="item3d-info">
            <div className="item3d-name">{target.name}</div>
            <div className="item3d-meta">
              <span>{t('items3d.tier', { tier: target.tier })}</span>
              <span className={`item3d-rarity rarity-${target.rarity}`}>{t(RARITY_LABEL[target.rarity] || RARITY_LABEL.common)}</span>
            </div>
            {!iconSrc && <div className="item3d-hint">{t('items3d.dragHint')}</div>}
          </div>
        )}
        {target?.kind === 'set' && (
          <div className="item3d-info">
            <div className="item3d-name">{target.name}</div>
            <div className="set3d-pieces">
              <button className={`set3d-piece-btn ${!isolated ? 'active' : ''}`} onClick={() => setIsolated(null)}>{t('items3d.setViewer.all')}</button>
              {setButtons.map((b) => (
                <button key={b.cat} className={`set3d-piece-btn ${isolated === b.cat ? 'active' : ''}`} onClick={() => setIsolated(b.cat)}>
                  {b.label}
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
