import { useEffect, useRef } from 'react';
import { BOY_MARKUP } from './boy/markup';
import './boy/boy-hud.css';

/**
 * 4a.1 — фасада на новия боен двигател (порт на boy/, „Двубой в Рейвънхолд“).
 * Стъпка 4a.1: монтира ОРИГИНАЛНАТА фиксирана хореография на boy през
 * порт-нат renderer (WebGPU → WebGL2 fallback вграден в самия main.js).
 * Няма текстури на този етап → baked.js пада автоматично на плоски
 * материали (виж boy/src/baked.js: manifest.json липсва → flatSet()).
 *
 * ИЗВЕСТНО ОГРАНИЧЕНИЕ (за 4a.2/4a.3): main.js е самостоятелно изпълним
 * ES модул (стартира twice-import-safe само защото браузърът кешира ESM
 * модула) — не приема параметри и няма dispose(). Guard-ът по-долу пази
 * от двойния efect на React StrictMode, но НЕ поддържа повторно монтиране
 * след unmount (напр. напускане и връщане на /demo/combat в SPA без пълно
 * презареждане). Пълен рефактор на main.js в boot(canvas, opts)→dispose()
 * е предвиден в 4a.2 (data-driven хореография изисква точно това).
 */
export default function BoyDuelStage(): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // StrictMode double-invoke guard: main.js вече е изпълнен веднъж срещу
    // първия набор DOM възли — втори innerHTML презапис би оставил
    // renderer-а закачен за detach-нат canvas.
    if (root.dataset.boyMounted === '1') return;
    root.dataset.boyMounted = '1';
    root.innerHTML = BOY_MARKUP;
    // Литерален relative specifier (не динамична променлива) — нужно е
    // Vite/Rollup да го открие статично и да го изнесе в собствен lazy chunk.
    void import('./boy/src/main.js');
  }, []);

  return <div className="boy-duel-root" ref={rootRef} />;
}
