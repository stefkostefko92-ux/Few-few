import { POSITION_LABELS, labelFor } from "@/lib/categories";
import { ageFrom } from "@/lib/format";

export type PlayerLike = {
  id: string;
  name: string;
  number?: number | null;
  position: string;
  birthDate?: Date | null;
  heightCm?: number | null;
  nationality?: string | null;
  photoUrl?: string | null;
};

export function PlayerCard({ player }: { player: PlayerLike }) {
  const age = ageFrom(player.birthDate);
  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[3/4] bg-gradient-to-b from-brand-800 to-brand-900">
        {player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photoUrl}
            alt={`${player.name} — ${labelFor(POSITION_LABELS, player.position)}`}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display text-7xl font-extrabold text-gold-400/90"
            aria-hidden
          >
            {player.number ?? "?"}
          </div>
        )}
        {player.number != null && (
          <span className="absolute left-0 top-0 bg-gold-400 px-2.5 py-1 text-sm font-bold text-brand-900">
            №{player.number}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-lg font-bold leading-tight text-slate-900">
          {player.name}
        </p>
        <p className="mt-0.5 text-sm font-medium text-brand-700">
          {labelFor(POSITION_LABELS, player.position)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {age != null && <>{age} г.</>}
          {age != null && player.nationality ? " · " : ""}
          {player.nationality}
        </p>
      </div>
    </div>
  );
}
