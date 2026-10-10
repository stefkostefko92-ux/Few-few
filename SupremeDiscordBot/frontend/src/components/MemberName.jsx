// frontend/src/components/MemberName.jsx
// Име на член вместо суров Discord ID. Страницата „Игра“ показваше цифри в
// Top 5, класацията, покупките, колекционерите, куестовете и trivia (преглед
// 10.10.2026) — играчите рядко влизат в таблото, затова имената идват живо от
// бота (`/api/servers/:id/member-names`, само за админ на сървъра) и не се
// пазят никъде. Една заявка на списък; без отговор (ботът спи, човекът е
// напуснал) — кратко ID, пълното е в title.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import api from "../api";

const SNOWFLAKE = /^\d{17,20}$/;

export function useMemberNames(ids) {
  const { serverId } = useParams();
  const list = useMemo(
    () => [...new Set((ids || []).filter(Boolean).map(String).filter((x) => SNOWFLAKE.test(x)))].sort().slice(0, 100),
    [ids],
  );
  const key = list.join(",");
  const { data } = useQuery({
    queryKey: ["member-names", serverId, key],
    queryFn: async () => (await api.get(`/servers/${serverId}/member-names`, { params: { ids: key } })).data?.members || {},
    enabled: !!serverId && list.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data || {};
}

export default function MemberName({ id, names, className = "" }) {
  if (!id) return null;
  const name = names?.[String(id)];
  return name
    ? <span className={className} title={String(id)}>{name}</span>
    : <span className={`font-mono ${className}`} title={String(id)}>@…{String(id).slice(-6)}</span>;
}
