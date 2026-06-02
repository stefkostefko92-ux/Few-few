import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FourPlayerTrick } from "../trick/FourPlayerTrick";

interface Play {
  seat: number;
  card: string;
}
interface KentState {
  hands: string[][];
  trick: Play[];
  turn: number;
  teamPoints: [number, number];
}
type KentAction = { type: "PLAY"; card: string };

export function KentView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<KentState, KentAction>("KENT");
  const { state, legal, seat, phase, result, players } = m;

  const playable = useMemo(
    () => new Map(legal.filter((a) => a.type === "PLAY").map((a) => [a.card, a])),
    [legal],
  );

  const myTeam = seat % 2;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <FourPlayerTrick
            state={state}
            seat={seat}
            playable={playable}
            names={(s) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`}
            emptyTrickLabel={t("belote.emptyTrick")}
            crest="♤"
            feltColor="#1a3d2c"
            feltDark="#0c2017"
            onPlay={(card) => {
              const a = playable.get(card);
              if (a) m.send(a);
            }}
            seatBadge={(s) => (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: s % 2 === myTeam ? "var(--win)" : "var(--loss)",
                }}
              />
            )}
          />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill label={t("belote.yourTeam")} value={state.teamPoints[myTeam] ?? 0} highlight />
            <ScorePill label={t("belote.theirTeam")} value={state.teamPoints[myTeam === 0 ? 1 : 0] ?? 0} />
          </div>
        </>
      ) : null}
    </Scene>
  );
}
