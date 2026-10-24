import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { battleshipFleetError, placeFleet } from "@aso/game-core";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { isRotateKey } from "./keys";

const SIZE = 10;
// БГ convention: columns А–К (Й is skipped), rows 1–10.
const COL_LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

/** Кораб в редактора: горна/лява клетка, дължина, посока. */
interface ShipLayout {
  r: number;
  c: number;
  len: number;
  horiz: boolean;
}

const cellsOf = (s: ShipLayout): number[] =>
  Array.from({ length: s.len }, (_, k) => (s.horiz ? s.r * SIZE + s.c + k : (s.r + k) * SIZE + s.c));

/** Държи кораба изцяло в полето. */
function clampShip(s: ShipLayout): ShipLayout {
  const maxR = s.horiz ? SIZE - 1 : SIZE - s.len;
  const maxC = s.horiz ? SIZE - s.len : SIZE - 1;
  return { ...s, r: Math.min(Math.max(0, s.r), maxR), c: Math.min(Math.max(0, s.c), maxC) };
}

function fromCells(fleet: number[][]): ShipLayout[] {
  return fleet.map((ship) => {
    const sorted = ship.slice().sort((a, b) => a - b);
    const first = sorted[0]!;
    const horiz = sorted.length === 1 || sorted[1]! - first === 1;
    return { r: Math.floor(first / SIZE), c: first % SIZE, len: sorted.length, horiz };
  });
}

/** Случайно подреждане в браузъра (само предложение — сървърът валидира). */
const randomLayout = (): ShipLayout[] =>
  fromCells(placeFleet({ int: (n: number) => Math.floor(Math.random() * n) }));

/** Кои кораби се застъпват или допират с друг (за червено оцветяване). */
function conflicts(layout: ShipLayout[]): Set<number> {
  const owner = new Map<number, number>();
  const bad = new Set<number>();
  layout.forEach((s, k) =>
    cellsOf(s).forEach((cell) => {
      const o = owner.get(cell);
      if (o !== undefined) {
        bad.add(o);
        bad.add(k);
      }
      owner.set(cell, k);
    }),
  );
  layout.forEach((s, k) => {
    for (const cell of cellsOf(s)) {
      const r = Math.floor(cell / SIZE);
      const c = cell % SIZE;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
          const o = owner.get(rr * SIZE + cc);
          if (o !== undefined && o !== k) {
            bad.add(o);
            bad.add(k);
          }
        }
      }
    }
  });
  return bad;
}

/**
 * Фаза на подреждане (Морски бой): играчът влачи корабите (или избира кораб и
 * кликва поле), завърта избрания („Завърти“ / клавиш R), може да поиска
 * „Случайно“ и праща флота с „Готов“. Валидирането тук е само подсказка —
 * сървърът проверява флота отново (в полето, без застъпване и допиране).
 */
export function BattleshipPlacement({
  ready,
  oppReady,
  onReady,
}: {
  ready: boolean;
  oppReady: boolean;
  onReady: (ships: number[][]) => void;
}) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<ShipLayout[]>(randomLayout);
  const [selected, setSelected] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const drag = useRef<{ ship: number; offset: number; moved: boolean } | null>(null);

  const owner = useMemo(() => {
    const map = new Map<number, number>();
    layout.forEach((s, k) => cellsOf(s).forEach((cell) => map.set(cell, k)));
    return map;
  }, [layout]);
  const bad = useMemo(() => conflicts(layout), [layout]);
  const ships = useMemo(() => layout.map(cellsOf), [layout]);
  const valid = battleshipFleetError(ships) === null;

  const moveShip = useCallback((k: number, r: number, c: number) => {
    setLayout((prev) => prev.map((s, i) => (i === k ? clampShip({ ...s, r, c }) : s)));
  }, []);
  const rotate = useCallback(() => {
    if (selected === null) return;
    setLayout((prev) => prev.map((s, i) => (i === selected ? clampShip({ ...s, horiz: !s.horiz }) : s)));
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // „R“ докато пишеш в чата (или Ctrl+R за презареждане) не върти кораба.
      if (isRotateKey(e)) rotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate]);

  const cellAt = (e: ReactPointerEvent): number | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-cell]");
    const v = el?.getAttribute("data-cell");
    return v === null || v === undefined ? null : Number(v);
  };

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (ready || sent) return;
    const cell = cellAt(e);
    if (cell === null) return;
    const k = owner.get(cell);
    if (k === undefined) {
      // Празно поле: премести избрания кораб тук.
      if (selected !== null) moveShip(selected, Math.floor(cell / SIZE), cell % SIZE);
      return;
    }
    const s = layout[k]!;
    const offset = s.horiz ? (cell % SIZE) - s.c : Math.floor(cell / SIZE) - s.r;
    drag.current = { ship: k, offset, moved: false };
    setSelected(k);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const cell = cellAt(e);
    if (cell === null) return;
    const s = layout[d.ship]!;
    const r = Math.floor(cell / SIZE) - (s.horiz ? 0 : d.offset);
    const c = (cell % SIZE) - (s.horiz ? d.offset : 0);
    if (r !== s.r || c !== s.c) {
      d.moved = true;
      moveShip(d.ship, r, c);
    }
  }
  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  }

  function submit() {
    if (!valid || sent || ready) return;
    setSent(true);
    playCue("flip");
    onReady(ships);
  }

  const locked = ready || sent;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-sm text-ink-100">
        {locked ? t("battleship.waitingOpp") : t("battleship.placeHint")}
      </p>
      <p className="text-center text-xs text-ink-muted">
        {oppReady ? t("battleship.oppReady") : t("battleship.oppPlacing")}
      </p>
      <div className="bs-board" aria-label={t("battleship.placeTitle")}>
        <span className="bs-corner" />
        <div className="bs-coords bs-coords--top">
          {COL_LETTERS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div className="bs-coords bs-coords--left">
          {Array.from({ length: SIZE }, (_, r) => (
            <span key={r}>{r + 1}</span>
          ))}
        </div>
        <div
          className={cn("bs-grid bs-grid--place", locked && "bs-grid--locked")}
          data-placement={locked ? "locked" : "open"}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ touchAction: "none" }}
        >
          {Array.from({ length: SIZE * SIZE }).map((_, cell) => {
            const k = owner.get(cell);
            return (
              <span
                key={cell}
                data-cell={cell}
                data-ship={k}
                data-selected={k !== undefined && k === selected ? "true" : undefined}
                data-bad={k !== undefined && bad.has(k) ? "true" : undefined}
                className={cn(
                  "bs-cell",
                  k !== undefined && "bs-cell--ship",
                  k !== undefined && bad.has(k) && "bs-cell--bad",
                  k !== undefined && k === selected && "bs-cell--selected",
                  !locked && "bs-cell--placeable",
                )}
              />
            );
          })}
        </div>
      </div>
      {!locked ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="felt" data-action="rotate" onClick={rotate} disabled={selected === null}>
            {t("battleship.rotate")}
          </Button>
          <Button
            variant="felt"
            data-action="random"
            onClick={() => {
              setLayout(randomLayout());
              setSelected(null);
            }}
          >
            {t("battleship.random")}
          </Button>
          <Button data-action="ready" onClick={submit} disabled={!valid}>
            {t("battleship.ready")}
          </Button>
        </div>
      ) : null}
      {!locked && !valid ? <p className="text-xs" style={{ color: "var(--loss)" }}>{t("battleship.invalid")}</p> : null}
    </div>
  );
}
