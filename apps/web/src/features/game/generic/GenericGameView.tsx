import { useTranslation } from "react-i18next";
import type { GameKey } from "@aso/shared";
import { Badge, Button, Panel } from "../../../ui";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { useMatch } from "../useMatch";

type Action = Record<string, unknown> & { type: string };

/**
 * Game-agnostic fallback view: shows the redacted state as compact JSON plus a
 * button per legal action. Every registered engine is therefore playable to
 * completion online vs bots without a bespoke scene (those are S9 polish).
 */
export function GenericGameView({ title, game }: { title: string; game: GameKey }) {
  const { t } = useTranslation();
  const m = useMatch<unknown, Action>(game);
  const { state, legal, seat, turn, phase, result } = m;
  const myTurn = turn === seat && legal.length > 0;

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      <div className="flex w-full flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <Badge tone="felt">
            {t("game.you")} #{seat}
          </Badge>
          <TurnBadge myTurn={myTurn} over={phase === "over"} />
        </div>

        {state ? (
          <Panel className="w-full overflow-auto">
            <pre className="max-h-72 whitespace-pre-wrap break-words text-xs text-ink-300">
              {JSON.stringify(state, null, 2)}
            </pre>
          </Panel>
        ) : null}

        {phase === "playing" ? (
          <div className="flex max-h-64 flex-wrap justify-center gap-2 overflow-auto">
            {legal.length === 0 ? (
              <p className="text-ink-muted">{t("game.opponentTurn")}</p>
            ) : (
              legal.map((action, i) => (
                <Button key={i} variant="felt" onClick={() => m.send(action)}>
                  {labelFor(action)}
                </Button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </MatchChrome>
  );
}

/** Compact human-ish label for an arbitrary engine action. */
function labelFor(action: Action): string {
  const { type, ...rest } = action;
  const parts = Object.entries(rest)
    .filter(([, v]) => v !== undefined && typeof v !== "object")
    .map(([, v]) => String(v));
  return parts.length ? `${type} ${parts.join(" ")}` : type;
}
