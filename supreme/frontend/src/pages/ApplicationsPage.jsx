// frontend/src/pages/ApplicationsPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, MessageSquare } from "lucide-react";
import { getApplications, getApplication, reviewApplication, deleteApplication, openApplicationDiscussion } from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

const STATUS_COLORS = {
  PENDING: "text-yellow-400 bg-yellow-500/10",
  APPROVED: "text-success bg-green-500/10",
  DENIED: "text-danger bg-red-500/10",
  INTERVIEW: "text-cs-muted bg-gray-500/10",  // Legacy — no longer assignable
};

export default function ApplicationsPage() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewAction, setReviewAction] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [discussMessage, setDiscussMessage] = useState(null); // { type: "status" | "alert", text }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", serverId, statusFilter, search, page],
    queryFn: () => getApplications(serverId, { status: statusFilter || undefined, search: search || undefined, page, limit: 20 }),
  });

  // Load full application details when expanded
  const { data: fullApp } = useQuery({
    queryKey: ["application", serverId, expanded],
    queryFn: () => getApplication(serverId, expanded),
    enabled: !!expanded,
  });

  const reviewMut = useMutation({
    mutationFn: ({ appId, action, note }) => reviewApplication(serverId, appId, action, note),
    onSuccess: (_data, { appId }) => {
      qc.invalidateQueries({ queryKey: ["applications", serverId] });
      qc.invalidateQueries({ queryKey: ["application", serverId, appId] });
      setReviewingId(null);
      setReviewNote("");
      setReviewAction(null);
      setExpanded(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (appId) => deleteApplication(serverId, appId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications", serverId] });
      setExpanded(null);
    },
  });

  const discussMut = useMutation({
    mutationFn: (appId) => openApplicationDiscussion(serverId, appId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["applications", serverId] });
      setDiscussMessage({
        type: "status",
        text: data.alreadyExists
          ? `💬 Discussion channel already open (#${data.channelId}). Check your Discord server.`
          : `✅ Discussion channel opened (#${data.channelId}). Check your Discord server.`,
      });
    },
    onError: (err) => {
      setDiscussMessage({
        type: "alert",
        text: `Failed to open discussion: ${err?.response?.data?.error || err.message}`,
      });
    },
  });

  const applications = data?.applications || [];
  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  const openReview = (appId, action) => {
    setReviewingId(appId);
    setReviewAction(action);
    setReviewNote("");
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cs-text">Applications</h1>
          <p className="text-cs-muted text-sm mt-1">{data?.total ?? 0} total applications</p>
        </div>
        <select
          className="cs-input w-40"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter applications by status"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="DENIED">Denied</option>
        </select>
      </div>

      {discussMessage && (
        <div
          role={discussMessage.type === "alert" ? "alert" : "status"}
          className={`cs-card mb-4 px-4 py-3 text-sm flex items-center justify-between gap-2 ${
            discussMessage.type === "alert"
              ? "border border-red-500/30 text-danger"
              : "border border-green-500/30 text-success"
          }`}
        >
          <span>{discussMessage.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDiscussMessage(null)}
            className="hover:opacity-80"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="cs-card text-center py-16 text-danger">
          Couldn't load applications — please retry.
        </div>
      ) : applications.length === 0 ? (
        <div className="cs-card text-center py-16 text-cs-muted">
          No applications found.
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const isOpen = expanded === app.id;
            const questions = fullApp?.form?.questions || [];
            const answers = fullApp?.answers || {};

            return (
              <div key={app.id} className="cs-card overflow-hidden">
                {/* Row */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : app.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded(isOpen ? null : app.id);
                    }
                  }}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-cs-cyan/20 flex items-center justify-center flex-shrink-0 text-cs-cyan font-bold">
                    {(app.user?.username || "?")[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-cs-text">{app.user?.username ?? "Unknown"}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-xl ${STATUS_COLORS[app.status]}`}>
                        {app.status}
                      </span>
                      <span className="text-xs text-cs-muted">• {app.form?.name}</span>
                    </div>
                    <p className="text-xs text-cs-muted mt-0.5">
                      {new Date(app.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Actions for pending */}
                  {app.status === "PENDING" && (
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openReview(app.id, "approve")}
                        title="Approve"
                        aria-label="Approve application"
                        className="text-success hover:text-green-300 transition-colors p-1.5 hover:bg-green-500/10 rounded-lg"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => discussMut.mutate(app.id)}
                        disabled={discussMut.isPending}
                        title="Open private discussion channel with applicant"
                        aria-label="Open private discussion channel with applicant"
                        className="text-cs-cyan hover:text-cyan-300 transition-colors p-1.5 hover:bg-cyan-500/10 rounded-lg disabled:opacity-40"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openReview(app.id, "deny")}
                        title="Deny"
                        aria-label="Deny application"
                        className="text-danger hover:text-red-300 transition-colors p-1.5 hover:bg-red-500/10 rounded-lg"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  )}

                  {/* Delete button — always available */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setConfirmState({
                        title: "Delete Application",
                        message: "Delete this application? This cannot be undone.",
                        onConfirm: () => deleteMut.mutate(app.id),
                      })}
                      disabled={deleteMut.isPending}
                      title="Delete application"
                      aria-label="Delete application"
                      className="text-cs-muted hover:text-danger transition-colors p-1.5 hover:bg-red-500/10 rounded-lg disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-cs-muted flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cs-muted flex-shrink-0" />
                  )}
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    {!fullApp ? (
                      <p className="text-cs-muted text-sm">Loading answers…</p>
                    ) : questions.length === 0 ? (
                      <p className="text-cs-muted text-sm italic">No questions recorded.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {questions.map((q) => (
                          <div key={q.id} className="bg-cs-bg rounded-lg p-3">
                            <p className="text-xs font-semibold text-cs-muted uppercase tracking-wide mb-1">
                              {q.label}
                            </p>
                            <p className="text-sm text-cs-text whitespace-pre-wrap">
                              {answers[q.id] || <span className="italic text-cs-muted">No answer</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ticket link if escalated (legacy) */}
                    {fullApp?.ticket && (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-cs-muted">Linked ticket:</span>
                        <span className="text-cs-muted">#{fullApp.ticket.channelId}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-cs-muted">
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

      {/* Review Confirmation Modal */}
      <Modal
        open={!!reviewingId}
        onClose={() => setReviewingId(null)}
        title={reviewAction === "approve" ? "✅ Approve Application" : reviewAction === "deny" ? "❌ Deny Application" : "Review Application"}
        maxWidth="max-w-md"
      >
        <p className="text-sm text-cs-muted mb-4">
          This action will mark the application as {reviewAction}d.
        </p>

        <label className="block mb-4">
          <span className="cs-label">Review Note (optional)</span>
          <textarea
            className="cs-input"
            rows={2}
            placeholder="Optional note sent to the applicant…"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            autoFocus
          />
        </label>

        {reviewMut.isError && (
          <p role="alert" className="text-danger text-sm mb-3">
            {reviewMut.error?.response?.data?.error || "Failed to submit review"}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button className="cs-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
          <button
            disabled={reviewMut.isPending}
            onClick={() => reviewMut.mutate({ appId: reviewingId, action: reviewAction, note: reviewNote })}
            className={
              reviewAction === "approve"
                ? "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                : reviewAction === "deny"
                ? "cs-btn-danger"
                : "cs-btn-primary"
            }
          >
            {reviewMut.isPending ? "Processing…" : reviewAction ? `Confirm ${reviewAction.charAt(0).toUpperCase() + reviewAction.slice(1)}` : "Confirm"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
