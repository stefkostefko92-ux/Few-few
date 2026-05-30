import { useTranslation } from "react-i18next";
import { Badge, Button } from "../../../ui";
import { CardFace } from "../cards/CardFace";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { useMatch } from "../useMatch";

interface Play {
  seat: number;
  card: string;
}
interface BeloteState {
  phase: "BID" | "PLAY";
  hands: string[][];
  trump: string | null;
  declarer: number | null;
  turn: number;
  trick: Play[];
  teamPoints: [number, number];
}
type BeloteAction =
  | { type: "PASS" }
  | { type: "CALL"; suit: string }
  | { type: "PLAY"; card: string };

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUITS = ["S", "H", "D", "C"];

export function BeloteView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<BeloteState, BeloteAction>("BELOTE");
  const { state, legal, seat, phase, result } = m;
  const myTurn = !!state && state.turn === seat && legal.length > 0;

  const passAction = legal.find((a) => a.type === "PASS");
  const callBySuit = (suit: string) =>
    legal.find((a): a is Extract<BeloteAction, { type: "CALL" }> => a.type === "CALL" && a.suit === suit);
  const playActions = legal.filter((a): a is Extract<BeloteAction, { type: "PLAY" }> => a.type === "PLAY");
  const actionForCard = (card: string) => playActions.find((a) => a.card === card);

  const myTeam = seat % 2;

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      {state ? (
        <div className="flex w-full flex-col items-center gap-6">
          {/* Status row */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Badge tone="felt" className="tnum">
              {t("belote.yourTeam")}: {state.teamPoints[myTeam]}
            </Badge>
            <Badge tone="felt" className="tnum">
              {t("belote.theirTeam")}: {state.teamPoints[myTeam === 0 ? 1 : 0]}
            </Badge>
            {state.trump ? (
              <Badge tone="brass">
                {t("santase.trump")} {SUIT_GLYPH[state.trump]}
              </Badge>
            ) : null}
            <TurnBadge myTurn={myTurn} over={phase === "over"} />
          </div>

          {/* Current trick */}
          {state.phase === "PLAY" ? (
            <div className="flex min-h-24 items-center gap-2 rounded-panel bg-felt-700/40 p-6">
              {state.trick.length === 0 ? (
                <span className="text-ink-muted">{t("belote.emptyTrick")}</span>
              ) : (
                state.trick.map((p, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <CardFace card={p.card} small />
                    <span className="text-xs text-ink-muted">#{p.seat}</span>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* Bidding controls */}
          {state.phase === "BID" && myTurn ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SUITS.map((suit) => {
                const call = callBySuit(suit);
                return (
                  <Button
                    key={suit}
                    variant="felt"
                    disabled={!call}
                    onClick={() => call && m.send(call)}
                  >
                    {SUIT_GLYPH[suit]}
                  </Button>
                );
              })}
              {passAction ? (
                <Button variant="ghost" onClick={() => m.send(passAction)}>
                  {t("belote.pass")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* My hand */}
          <div className="flex flex-wrap justify-center gap-2">
            {state.hands[seat]!.map((card, i) => {
              const action = actionForCard(card);
              const playable = myTurn && state.phase === "PLAY" && !!action;
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
