// frontend/src/pages/TicketsPage.jsx
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Shield, X, XCircle, ChevronLeft, ChevronRight, FileText, Star, Ticket, RefreshCw, MessageSquare, Search, Plus } from "lucide-react";
import { timeAgo } from "../utils/timeAgo";
import { getTickets, closeTicket, claimTicket, exportTicketPDF, replyToTicket } from "../api";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import { useToast } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";

// Статусът — точка + ДУМА в хапче (концепцията, 10.10.2026), никога само цвят.
const STATUS_STYLE = {
  OPEN: { dot: "bg-success", cls: "text-success border-success/35 bg-success/10" },
  CLAIMED: { dot: "bg-cs-cyan", cls: "text-cs-cyan border-cs-cyan/35 bg-cs-cyan/10" },
  CLOSED: { dot: "bg-cs-dim", cls: "text-cs-muted border-cs-line bg-cs-panel" },
  ARCHIVED: { dot: "bg-cs-dim", cls: "text-cs-muted border-cs-line bg-cs-panel" },
};
const STATUS_TABS = ["", "OPEN", "CLAIMED", "CLOSED", "ARCHIVED"];

// Договор с backend (миграция v30): LOW | NORMAL | HIGH | URGENT.
// NORMAL се показва приглушено — приоритетът шуми само когато е различен.
const PRIORITY_COLORS = {
  URGENT: "text-danger border-danger/35 bg-danger/10",
  HIGH:   "text-warning border-warning/35 bg-warning/10",
  NORMAL: "text-cs-muted border-cs-line bg-cs-panel",
  LOW:    "text-cs-dim border-cs-line bg-transparent",
};

const LIMIT = 20;

export default function TicketsPage() {
  const { serverId } = useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [closingId, setClosingId] = useState(null);
  const [closeReason, setCloseReason] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const toast = useToast();

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["tickets", serverId, statusFilter, priorityFilter, search, dateFrom, dateTo, page],
    queryFn: () => getTickets(serverId, {
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      limit: LIMIT,
    }),
  });

  const hasFilters = !!(statusFilter || priorityFilter || search || dateFrom || dateTo);
  const clearFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const closeMut = useMutation({
    mutationFn: ({ ticketId, reason }) => closeTicket(serverId, ticketId, reason),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tickets", serverId] });
      setClosingId(null);
      setCloseReason("");
      // botWarning = тикетът е затворен в базата, но Discord каналът НЕ —
      // казваме го честно, вместо да рапортуваме пълен успех (лъжещ успех).
      if (data?.botWarning) toast.error(data.botWarning);
    },
    // Провалът потъваше безследно — модалът си стоеше отворен без обяснение.
    onError: (err) => toast.error(err?.response?.data?.error || t("auto.actionFailed")),
  });

  const [claimError, setClaimError] = useState(null);
  const [pdfExporting, setPdfExporting] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  async function handlePdfExport(ticketId) {
    setPdfExporting(ticketId);
    setPdfError(null);
    try {
      const blob = await exportTicketPDF(serverId, ticketId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${ticketId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(t("tickets.pdfFailed"));
    } finally {
      setPdfExporting(null);
    }
  }

  const claimMut = useMutation({
    mutationFn: (ticketId) => claimTicket(serverId, ticketId),
    // botWarning: поето в базата, но Discord НЕ е уведомен — досега се
    // игнорираше и staff мислеше, че каналът знае (одит 26.09.2026).
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["tickets", serverId] }); setClaimError(null); if (data?.botWarning) toast.error(data.botWarning); },
    onError: (err) => setClaimError(err?.response?.data?.error || t("tickets.claimFailed")),
  });

  const replyMut = useMutation({
    mutationFn: ({ ticketId, content }) => replyToTicket(serverId, ticketId, content),
    onSuccess: () => {
      toast.success("Reply sent to the ticket channel");
      setReplyingId(null);
      setReplyText("");
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("tickets.replyFailed")),
  });

  const tickets = data?.tickets || [];
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header (концепцията): заглавие и брой вляво; търсене и „нов панел“
          вдясно. Тикет не се създава от таблото — идва от панел в Discord,
          затова бутонът води към панелите, не обещава „нов тикет“. */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="shrink-0">
          <h1 className="!text-[1.75rem] sm:!text-3xl !font-bold !tracking-tight text-cs-text leading-tight">{t("tickets.title")}</h1>
          <p className="text-cs-muted text-sm mt-1">
            {t("tickets.totalCount", { n: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim pointer-events-none" aria-hidden="true" />
            <input
              className="cs-input w-56 !pl-9"
              placeholder={t("tickets.searchPlaceholder")}
              aria-label={t("tickets.search")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Link to={`/dashboard/${serverId}/panels`} className="cs-btn-primary cs-btn-sm no-underline">
            <Plus className="w-4 h-4" aria-hidden="true" /> {t("common.createPanel")}
          </Link>
        </div>
      </div>

      {/* Статус като превключватели с истински броячи (statusCounts от API-то)
          + вторичните филтри вдясно. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("tickets.filterByStatus")}>
          {STATUS_TABS.map((st) => {
            const counts = data?.statusCounts || {};
            const n = st ? (counts[st] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);
            const on = statusFilter === st;
            return (
              <button
                key={st || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => { setStatusFilter(st); setPage(1); }}
                className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg text-[13px] font-medium border transition-colors ${
                  on ? "bg-cs-cyan/10 text-cs-cyan border-cs-cyan/45" : "text-cs-muted border-cs-line hover:text-cs-text hover:border-cs-borderHi"
                }`}
              >
                {st ? t(`status.${st.toLowerCase()}`) : t("tickets.tab.all")}
                {data?.statusCounts && <span className="tabular-nums text-cs-dim">({n})</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            className="cs-input w-40 !py-1.5"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title={t("tickets.fromDate")}
            aria-label={t("tickets.fromDate")}
          />
          <input
            type="date"
            className="cs-input w-40 !py-1.5"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title={t("tickets.toDate")}
            aria-label={t("tickets.toDate")}
          />
          <select
            className="cs-input w-40 !py-1.5"
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
            aria-label={t("tickets.filterByPriority")}
          >
            <option value="">{t("priority.all")}</option>
            <option value="URGENT">{t("priority.urgent")}</option>
            <option value="HIGH">{t("priority.high")}</option>
            <option value="NORMAL">{t("priority.normal")}</option>
            <option value="LOW">{t("priority.low")}</option>
          </select>
        </div>
      </div>

      {pdfError && (
        <div role="alert" className="cs-card border border-red-500/30 text-danger text-sm px-4 py-3 mb-4">
          {pdfError}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="cs-card h-14 animate-pulse bg-cs-panel" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="cs-card text-center py-16 text-danger flex flex-col items-center gap-3">
          <span>Couldn't load tickets — please retry.</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="cs-btn-secondary text-xs flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
            {isRefetching ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : tickets.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={Ticket}
            title={t("tickets.filtered.title")}
            description="Try adjusting the search, date range, or status filter."
            ctaLabel={t("tickets.filtered.cta")}
            onCtaClick={clearFilters}
          />
        ) : (
          <EmptyState
            icon={Ticket}
            title={t("tickets.empty.title")}
            description="Tickets will show up here once members start using a ticket panel."
            ctaLabel={t("tickets.empty.cta")}
            ctaTo={`/dashboard/${serverId}/panels`}
          />
        )
      ) : (
        <>
          <div className="cs-card !p-0 overflow-x-auto">
            <table className="cs-table w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("tickets.col.creator")}</th>
                  <th>{t("common.panel")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.priority")}</th>
                  <th>{t("tickets.col.assignedTo")}</th>
                  <th>{t("tickets.col.rating")}</th>
                  <th>{t("tickets.col.opened")}</th>
                  <th className="!text-right">{t("tickets.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.CLOSED;
                  const pr = ticket.priority || "NORMAL";
                  return (
                  <tr key={ticket.id}>
                    <td>
                      <span className="text-[13px] tabular-nums font-semibold text-cs-text">
                        {ticket.number != null ? `#${String(ticket.number).padStart(4, "0")}` : ticket.id.slice(0, 6)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {ticket.creator?.avatar ? (
                          <img
                            src={`https://cdn.discordapp.com/avatars/${ticket.creator.id}/${ticket.creator.avatar}.png?size=32`}
                            className="w-7 h-7 rounded-full bg-cs-panel flex-none"
                            alt=""
                          />
                        ) : (
                          <span aria-hidden="true" className="w-7 h-7 rounded-full bg-cs-cyan/15 text-cs-cyan text-xs font-bold flex items-center justify-center flex-none">
                            {String(ticket.creator?.username || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="text-cs-text">{ticket.creator?.username ?? "Unknown"}</span>
                      </div>
                    </td>
                    <td className="text-cs-muted">{ticket.panel?.name ?? "—"}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${st.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} aria-hidden="true" />
                        {t(`status.${ticket.status.toLowerCase()}`)}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[pr] || PRIORITY_COLORS.NORMAL}`}>
                        {t(`priority.${pr.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="text-cs-muted">
                      {ticket.assignee?.username ?? <span className="text-cs-dim">{t("tickets.unassigned")}</span>}
                    </td>
                    <td>
                      {ticket.feedbackRating
                        ? <span
                            className="inline-flex items-center gap-0.5"
                            title={ticket.feedbackComment || ""}
                            aria-label={`Rating: ${ticket.feedbackRating} of 5`}
                          >
                            {Array.from({ length: ticket.feedbackRating }).map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 text-cs-cyan fill-cs-cyan" aria-hidden="true" />
                            ))}
                          </span>
                        : <span className="text-cs-dim text-xs">—</span>}
                    </td>
                    <td className="text-cs-muted text-[13px] whitespace-nowrap">
                      <time dateTime={new Date(ticket.createdAt).toISOString()} title={new Date(ticket.createdAt).toLocaleString()}>
                        {timeAgo(ticket.createdAt, lang)}
                      </time>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        {(ticket.status === "OPEN" || ticket.status === "CLAIMED") && (
                          <button
                            onClick={() => { setReplyingId(ticket.id); setReplyText(""); }}
                            title={t("tickets.replyFromDashboard")}
                            aria-label={t("tickets.replyFromDashboard")}
                            className="rounded-md text-cs-cyan hover:bg-cs-cyan/10 transition-colors p-1.5"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        {ticket.status === "OPEN" && (
                          <button
                            onClick={() => claimMut.mutate(ticket.id)}
                            disabled={claimMut.isPending}
                            title={t("tickets.claim")}
                            aria-label={t("tickets.claim")}
                            className="rounded-md text-cs-muted hover:text-cs-cyan hover:bg-cs-panel transition-colors p-1.5"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                        )}
                        {ticket.archiveUrl && (ticket.hasArchive || ticket.status === "CLOSED" || ticket.status === "ARCHIVED") && (
                          <>
                            <a
                              href={ticket.archiveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t("tickets.viewTranscript")}
                              aria-label={t("tickets.viewTranscript")}
                              className="rounded-md text-cs-muted hover:text-cs-cyan hover:bg-cs-panel transition-colors p-1.5"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handlePdfExport(ticket.id)}
                              disabled={pdfExporting === ticket.id}
                              title={t("tickets.downloadPdf")}
                              aria-label={t("tickets.downloadPdf")}
                              className="rounded-md text-cs-muted hover:text-cs-cyan hover:bg-cs-panel transition-colors p-1.5 disabled:opacity-40"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {ticket.status !== "CLOSED" && ticket.status !== "ARCHIVED" && (
                          <button
                            onClick={() => { setClosingId(ticket.id); setCloseReason(""); }}
                            title={t("tickets.close")}
                            aria-label={t("tickets.close")}
                            className="rounded-md text-cs-muted hover:text-danger hover:bg-danger/10 transition-colors p-1.5"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-cs-muted">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="cs-btn-ghost py-1 px-3 disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="cs-btn-ghost py-1 px-3 disabled:opacity-40 flex items-center gap-1"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {claimError && (
        <div role="alert" className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500/30 text-danger text-sm px-4 py-3 rounded-lg z-50 flex items-center gap-2">
          <span className="flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {claimError}
          </span>
          <button
            type="button"
            aria-label={t("common.dismiss")}
            onClick={() => setClaimError(null)}
            className="text-danger hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reply Modal — same pattern as the close modal (closingId/closeReason) */}
      <Modal open={!!replyingId} onClose={() => setReplyingId(null)} title={t("tickets.reply")} maxWidth="max-w-md">
        <label className="block mb-1">
          <span className="cs-label">{t("common.reply")}</span>
          <textarea
            className="cs-input min-h-[110px] resize-y"
            placeholder={t("tickets.replyPlaceholder")}
            maxLength={1500}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            autoFocus
          />
        </label>
        <div className="text-xs text-cs-muted text-right mb-4">{replyText.length}/1500</div>
        <div className="flex gap-3 justify-end">
          <button className="cs-btn-ghost" onClick={() => setReplyingId(null)}>{t("common.cancel")}</button>
          <button
            className="cs-btn-primary"
            disabled={replyMut.isPending || !replyText.trim()}
            onClick={() => replyMut.mutate({ ticketId: replyingId, content: replyText.trim() })}
          >
            {replyMut.isPending ? t("common.sending") : t("common.reply")}
          </button>
        </div>
      </Modal>

      {/* Close Ticket Modal */}
      <Modal open={!!closingId} onClose={() => setClosingId(null)} title="Close ticket" maxWidth="max-w-md">
        <label className="block mb-4">
          <span className="cs-label">{t("ui.closeReasonOpt")}</span>
          <input
            className="cs-input"
            placeholder={t("ui.ph.closeReason")}
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            autoFocus
          />
        </label>
        <div className="flex gap-3 justify-end">
          <button className="cs-btn-ghost" onClick={() => setClosingId(null)}>Cancel</button>
          <button
            className="cs-btn-danger"
            disabled={closeMut.isPending}
            onClick={() => closeMut.mutate({ ticketId: closingId, reason: closeReason })}
          >
            {closeMut.isPending ? "Closing…" : "Close ticket"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
