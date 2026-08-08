// frontend/src/pages/TicketsPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Shield, X, XCircle, ChevronLeft, ChevronRight, FileText, Star, Ticket, RefreshCw, MessageSquare } from "lucide-react";
import { getTickets, closeTicket, claimTicket, exportTicketPDF, replyToTicket } from "../api";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import { useToast } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";

const STATUS_COLORS = {
  OPEN: "text-success bg-green-500/10",
  CLAIMED: "text-blue-400 bg-blue-500/10",
  CLOSED: "text-cs-muted bg-gray-500/10",
  ARCHIVED: "text-cs-muted bg-gray-500/10",
};

// Договор с backend (миграция v30): LOW | NORMAL | HIGH | URGENT.
// NORMAL се показва приглушено — приоритетът шуми само когато е различен.
const PRIORITY_COLORS = {
  URGENT: "text-danger bg-red-500/10",
  HIGH:   "text-cs-gold bg-yellow-500/10",
  NORMAL: "text-cs-muted bg-gray-500/10",
  LOW:    "text-cs-dim bg-gray-500/5",
};

const LIMIT = 20;

export default function TicketsPage() {
  const { serverId } = useParams();
  const { t } = useT();
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", serverId] });
      setClosingId(null);
      setCloseReason("");
    },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets", serverId] }); setClaimError(null); },
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cs-text">{t("tickets.title")}</h1>
          <p className="text-cs-muted text-sm mt-1">
            {t("tickets.totalCount", { n: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="cs-input w-52"
            placeholder={t("tickets.searchPlaceholder")}
            aria-label={t("tickets.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <input
            type="date"
            className="cs-input w-40"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title={t("tickets.fromDate")}
            aria-label={t("tickets.fromDate")}
          />
          <input
            type="date"
            className="cs-input w-40"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title={t("tickets.toDate")}
            aria-label={t("tickets.toDate")}
          />
          <select
            className="cs-input w-40"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label={t("tickets.filterByStatus")}
          >
            <option value="">{t("common.allStatuses")}</option>
            <option value="OPEN">{t("status.open")}</option>
            <option value="CLAIMED">{t("status.claimed")}</option>
            <option value="CLOSED">{t("status.closed")}</option>
            <option value="ARCHIVED">{t("status.archived")}</option>
          </select>
          <select
            className="cs-input w-40"
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
            aria-label={t("tickets.filterByPriority")}
          >
            <option value="">{t("priority.all")}</option>
            <option value="URGENT">{t("priority.urgent")}</option>
            <option value="HIGH">{t("priority.high")}</option>
            <option value="NORMAL">{t("priority.normal")}</option>
            <option value="LOW">Low</option>
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
          <div className="cs-card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-cs-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">{t("common.status")}</th>
                  <th className="text-left px-4 py-3">{t("common.priority")}</th>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">{t("tickets.col.creator")}</th>
                  <th className="text-left px-4 py-3">{t("tickets.col.assignedTo")}</th>
                  <th className="text-left px-4 py-3">{t("common.panel")}</th>
                  <th className="text-left px-4 py-3">{t("tickets.col.rating")}</th>
                  <th className="text-left px-4 py-3">{t("tickets.col.opened")}</th>
                  <th className="text-left px-4 py-3">{t("tickets.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-xl ${STATUS_COLORS[ticket.status]}`}>
                        {t(`status.${ticket.status.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-xl ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.NORMAL}`}>
                        {(ticket.priority || "NORMAL").charAt(0) + (ticket.priority || "NORMAL").slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-cs-cyan font-semibold">
                        {ticket.number != null ? `#${String(ticket.number).padStart(4, "0")}` : ticket.id.slice(0, 6)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {ticket.creator?.avatar && (
                          <img
                            src={`https://cdn.discordapp.com/avatars/${ticket.creator.id}/${ticket.creator.avatar}.png?size=32`}
                            className="w-5 h-5 rounded-full"
                            alt=""
                          />
                        )}
                        <span className="text-cs-text">{ticket.creator?.username ?? "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-cs-muted">
                      {ticket.assignee?.username ?? <span className="text-cs-muted italic">{t("tickets.unassigned")}</span>}
                    </td>
                    <td className="px-4 py-3 text-cs-muted">
                      {ticket.panel?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
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
                        : <span className="text-cs-muted text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-cs-muted text-xs">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(ticket.status === "OPEN" || ticket.status === "CLAIMED") && (
                          <button
                            onClick={() => { setReplyingId(ticket.id); setReplyText(""); }}
                            title={t("tickets.replyFromDashboard")}
                            aria-label={t("tickets.replyFromDashboard")}
                            className="text-cs-cyan hover:text-white transition-colors p-1"
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
                            className="text-blue-400 hover:text-blue-300 transition-colors p-1"
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
                              className="text-cs-cyan hover:text-white transition-colors p-1"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handlePdfExport(ticket.id)}
                              disabled={pdfExporting === ticket.id}
                              title={t("tickets.downloadPdf")}
                              aria-label={t("tickets.downloadPdf")}
                              className="text-purple-400 hover:text-purple-300 transition-colors p-1 disabled:opacity-40"
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
                            className="text-danger hover:text-red-300 transition-colors p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
      <Modal open={!!closingId} onClose={() => setClosingId(null)} title="Close Ticket" maxWidth="max-w-md">
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
            {closeMut.isPending ? "Closing…" : "Close Ticket"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
