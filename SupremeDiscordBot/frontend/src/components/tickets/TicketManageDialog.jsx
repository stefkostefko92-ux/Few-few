// frontend/src/components/tickets/TicketManageDialog.jsx
// „Управлявай тикет“ — всичко, което персоналът прави с команди в канала на тикета, и от таблото
// (собственикът, 28.11.2026: „каквото може ботът, да го има в web панела“):
// приоритет (/ticket priority), освобождаване (/ticket unclaim), име (/rename),
// друг панел (/escalate), добави/махни човек (/ticket add|remove).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../Modal";
import { setTicketPriority, unclaimTicket, renameTicket, moveTicket, ticketMember, searchServerMembers, getPanels } from "../../api";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function manageError(err, t) {
  const code = err?.response?.data?.code;
  if (code === "PREMIUM_REQUIRED") return t("tickets.manage.premium");
  if (code === "BOT_ACTION_FAILED") return t("tickets.manage.botFailed");
  if (code === "TICKET_NOT_OPEN") return t("tickets.manage.closed");
  return t("tickets.manage.error");
}

export default function TicketManageDialog({ serverId, ticket, onClose }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["tickets", serverId] });
  const [priority, setPriority] = useState(ticket.priority || "NORMAL");
  const [name, setName] = useState("");
  const [panelId, setPanelId] = useState("");
  const [query, setQuery] = useState("");
  const [searchFor, setSearchFor] = useState("");

  const { data: panels = [] } = useQuery({ queryKey: ["panels", serverId], queryFn: () => getPanels(serverId) });
  const people = useQuery({
    queryKey: ["memberSearch", serverId, searchFor],
    queryFn: () => searchServerMembers(serverId, searchFor),
    enabled: searchFor.length >= 2,
    retry: false,
  });

  const onErr = (e) => toast.error(manageError(e, t));
  const prio = useMutation({ mutationFn: () => setTicketPriority(serverId, ticket.id, priority), onSuccess: () => { toast.success(t("tickets.manage.prioritySaved")); refresh(); }, onError: onErr });
  const release = useMutation({ mutationFn: () => unclaimTicket(serverId, ticket.id), onSuccess: () => { toast.success(t("tickets.manage.released")); refresh(); onClose(); }, onError: onErr });
  const rename = useMutation({ mutationFn: () => renameTicket(serverId, ticket.id, name), onSuccess: () => { toast.success(t("tickets.manage.renamed")); setName(""); refresh(); }, onError: onErr });
  const move = useMutation({ mutationFn: () => moveTicket(serverId, ticket.id, panelId), onSuccess: () => { toast.success(t("tickets.manage.moved")); refresh(); onClose(); }, onError: onErr });
  const member = useMutation({
    mutationFn: ({ userId, action }) => ticketMember(serverId, ticket.id, userId, action),
    onSuccess: (_d, v) => toast.success(t(v.action === "add" ? "tickets.manage.added" : "tickets.manage.removed", { name: v.name })),
    onError: onErr,
  });

  const otherPanels = (Array.isArray(panels) ? panels : []).filter((p) => p.id !== ticket.panelId);
  const number = ticket.number != null ? String(ticket.number).padStart(4, "0") : ticket.id.slice(0, 6);
  const section = "border-t border-cs-border pt-4 mt-4";

  return (
    <Modal open onClose={onClose} title={t("tickets.manage.title", { number })} maxWidth="max-w-xl">
      <div>
        <label className="cs-label" htmlFor="tm-priority">{t("tickets.manage.priority")}</label>
        <div className="flex flex-wrap gap-2">
          <select id="tm-priority" className="cs-input flex-1 min-w-[10rem]" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p.toLowerCase()}`)}</option>)}
          </select>
          <button type="button" className="cs-btn-secondary" disabled={prio.isPending || priority === (ticket.priority || "NORMAL")} onClick={() => prio.mutate()}>
            {t("tickets.manage.savePriority")}
          </button>
        </div>
      </div>

      {ticket.status === "CLAIMED" && (
        <div className={section}>
          <p className="text-sm text-cs-muted mb-2">{t("tickets.manage.releaseHint", { name: ticket.assignee?.username || "—" })}</p>
          <button type="button" className="cs-btn-secondary" disabled={release.isPending} onClick={() => release.mutate()}>{t("tickets.manage.release")}</button>
        </div>
      )}

      <div className={section}>
        <label className="cs-label" htmlFor="tm-name">{t("tickets.manage.rename")}</label>
        <p className="text-xs text-cs-dim mb-2">{t("tickets.manage.renameHint")}</p>
        <div className="flex flex-wrap gap-2">
          <input id="tm-name" className="cs-input flex-1 min-w-[10rem]" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button type="button" className="cs-btn-secondary" disabled={rename.isPending || !name.trim()} onClick={() => rename.mutate()}>{t("tickets.manage.renameSave")}</button>
        </div>
      </div>

      {otherPanels.length > 0 && (
        <div className={section}>
          <label className="cs-label" htmlFor="tm-move">{t("tickets.manage.move")}</label>
          <p className="text-xs text-cs-dim mb-2">{t("tickets.manage.moveHint")}</p>
          <div className="flex flex-wrap gap-2">
            <select id="tm-move" className="cs-input flex-1 min-w-[10rem]" value={panelId} onChange={(e) => setPanelId(e.target.value)}>
              <option value="">{t("tickets.manage.movePick")}</option>
              {otherPanels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="cs-btn-secondary" disabled={move.isPending || !panelId} onClick={() => move.mutate()}>{t("tickets.manage.moveSave")}</button>
          </div>
        </div>
      )}

      <div className={section}>
        <p className="cs-label">{t("tickets.manage.people")}</p>
        <p className="text-xs text-cs-dim mb-2">{t("tickets.manage.peopleHint")}</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setSearchFor(query.trim()); }}>
          <input className="cs-input flex-1 min-w-[10rem]" aria-label={t("tickets.manage.searchLabel")} placeholder={t("tickets.manage.searchLabel")} maxLength={32} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="cs-btn-secondary" disabled={query.trim().length < 2}>{t("tickets.manage.search")}</button>
        </form>
        {searchFor.length >= 2 && (
          <ul className="mt-3 divide-y divide-cs-border" aria-live="polite">
            {people.isLoading && <li className="py-2 text-sm text-cs-muted">{t("common.loading")}</li>}
            {people.isError && <li className="py-2 text-sm text-danger">{t("tickets.manage.error")}</li>}
            {people.data && people.data.members.length === 0 && <li className="py-2 text-sm text-cs-muted">{t("tickets.manage.noResults")}</li>}
            {(people.data?.members || []).map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm text-cs-text">{m.name}{m.username && m.username !== m.name ? <span className="text-cs-dim"> @{m.username}</span> : null}</span>
                <span className="flex gap-2">
                  <button type="button" className="cs-btn-ghost cs-btn-sm" disabled={member.isPending} onClick={() => member.mutate({ userId: m.id, action: "add", name: m.name })}>{t("tickets.manage.add")}</button>
                  <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" disabled={member.isPending} onClick={() => member.mutate({ userId: m.id, action: "remove", name: m.name })}>{t("tickets.manage.remove")}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end pt-4 mt-4 border-t border-cs-border">
        <button type="button" className="cs-btn-secondary" onClick={onClose}>{t("common.close")}</button>
      </div>
    </Modal>
  );
}
