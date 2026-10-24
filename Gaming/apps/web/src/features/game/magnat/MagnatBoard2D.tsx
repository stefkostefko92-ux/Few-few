import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BOARD, GROUP_COLORS, type MagnatState } from "@aso/shared";
import { cn } from "../../../ui";
import { tileCell } from "./board2d";

/**
 * 2D дъска на Магнат — резервният вариант без WebGL (стари устройства, изключен
 * хардуерен рендер). Само показва: полета с цветните ленти на комплектите,
 * собственика (цветна черта отдолу), къщи/хотел, ипотека и пуловете на всички
 * играчи. Действията остават в таблото вдясно. Преди без WebGL нямаше дъска
 * изобщо — играчът не виждаше къде е, нито кой какво притежава.
 */
export function MagnatBoard2D({
  state,
  seat,
  colors,
  nameOf,
}: {
  state: MagnatState;
  seat: number;
  colors: readonly string[];
  nameOf: (s: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mag2d-wrap">
      <div className="mag2d" role="group" aria-label={t("magnat.boardTitle")}>
        {BOARD.map((tile, i) => {
          const { row, col } = tileCell(i);
          const owner = state.owner[i] ?? -1;
          const houses = state.houses[i] ?? 0;
          const mortgaged = state.mortgaged[i] === true;
          const here = state.pos.flatMap((p, s) => (p === i && !state.bankrupt[s] ? [s] : []));
          const label = [
            tile.name,
            owner >= 0 ? nameOf(owner) : "",
            houses === 5 ? t("magnat.hotel") : houses > 0 ? t("magnat.houses", { n: houses }) : "",
            mortgaged ? t("magnat.mortgaged") : "",
            ...here.map((s) => nameOf(s)),
          ]
            .filter(Boolean)
            .join(" · ");
          const style = {
            gridRow: row,
            gridColumn: col,
            ...(owner >= 0 ? { "--owner": colors[owner % colors.length] } : {}),
          } as CSSProperties;
          return (
            <div
              key={i}
              className={cn(
                "mag2d-tile",
                (i % 10 === 0) && "mag2d-tile--corner",
                mortgaged && "mag2d-tile--mortgaged",
              )}
              style={style}
              data-tile={i}
              data-owner={owner >= 0 ? owner : undefined}
              data-houses={houses > 0 ? houses : undefined}
              data-mortgaged={mortgaged ? "true" : undefined}
              data-tokens={here.length > 0 ? here.join(",") : undefined}
              title={label}
              aria-label={label}
            >
              {tile.type === "prop" ? <span className="mag2d-band" style={{ background: GROUP_COLORS[tile.group] }} /> : null}
              <span className="mag2d-name" aria-hidden>
                {tile.name}
              </span>
              {houses > 0 ? (
                <span className="mag2d-houses" aria-hidden>
                  {houses === 5 ? "🏨" : `🏠${houses}`}
                </span>
              ) : null}
              {here.length > 0 ? (
                <span className="mag2d-tokens" aria-hidden>
                  {here.map((s) => (
                    <span
                      key={s}
                      className={cn("mag2d-token", s === seat && "mag2d-token--me")}
                      style={{ background: colors[s % colors.length] }}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
        <div className="mag2d-center" aria-hidden>
          <span className="mag2d-title">{t("magnat.boardTitle")}</span>
          {state.dice ? (
            <span className="mag2d-dice">
              🎲 {state.dice[0]} + {state.dice[1]}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
