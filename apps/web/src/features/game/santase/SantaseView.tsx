import { useTranslation } from "react-i18next";
import { Badge, Button } from "../../../ui";
import { CardFace } from "../cards/CardFace";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { useMatch } from "../useMatch";

interface Play {
  seat: number;
  card: string;
}
interface SantaseState {
  hands: string[][];
  stock: string[];
  trump: string;
  trumpCard: string | null;
  turn: number;
  trick: Play[];
  points: [number, number];
  closed: boolean;
}
type SantaseAction =
  | { type: "PLAY"; card: string; marriage?: boolean }
  | { type: "CLOSE" }
  | { type: "EXCHANGE" };

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function SantaseView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<SantaseState, SantaseAction>("SANTASE");
  const { state, legal, seat, phase, result } = m;
  const myTurn = !!state && state.turn === seat && legal.length > 0;

  const playActions = legal.filter((a): a is Extract<SantaseAction, { type: "PLAY" }> => a.type === "PLAY");
  const closeAction = legal.find((a) => a.type === "CLOSE");
  const exchangeAction = legal.find((a) => a.type === "EXCHANGE");

  // Prefer the marriage variant when both exist for a card (always beneficial).
  const actionForCard = (card: string) =>
    playActions.find((a) => a.card === card && a.marriage) ??
    playActions.find((a) => a.card === card);

  const opp = seat === 0 ? 1 : 0;

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      {state ? (
        <div className="flex w-full flex-col items-center gap-6">
          {/* Opponent */}
          <div className="flex items-center gap-2">
            <Badge tone="felt" className="tnum">
              {state.points[opp]}
            </Badge>
            <div className="flex gap-1">
              {state.hands[opp]!.map((_, i) => (
                <CardFace key={i} card="?" small />
              ))}
            </div>
          </div>

          {/* Table: trump + stock + current trick */}
          <div className="flex items-center gap-8 rounded-panel bg-felt-700/40 p-6">
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                {state.trumpCard ? <CardFace card={state.trumpCard} small /> : <CardFace card="?" small />}
              </div>
              <span className="tnum text-xs text-ink-muted">
                {t("santase.stock", { count: state.stock.length })}
              </span>
              <Badge tone="brass">
                {t("santase.trump")} {SUIT_GLYPH[state.trump]}
              </Badge>
            </div>
            <div className="flex min-h-24 items-center gap-2">
              {state.trick.map((p, i) => (
                <CardFace key={i} card={p.card} />
              ))}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3">
            <Badge tone="felt" className="tnum">
              {t("game.you")}: {state.points[seat]}
            </Badge>
            <TurnBadge myTurn={myTurn} over={phase === "over"} />
            {closeAction ? (
              <Button variant="felt" onClick={() => m.send(closeAction)}>
                {t("santase.close")}
              </Button>
            ) : null}
            {exchangeAction ? (
              <Button variant="felt" onClick={() => m.send(exchangeAction)}>
                {t("santase.exchange")}
              </Button>
            ) : null}
          </div>

          {/* My hand */}
          <div className="flex gap-2">
            {state.hands[seat]!.map((card, i) => {
              const action = actionForCard(card);
              const playable = myTurn && !!action;
              return (
                <CardFace
                  key={`${card}-${i}`}
                  card={card}
                  playable={playable}
                  onClick={playable ? () => action && m.send(action) : undefined}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </MatchChrome>
  );
}
