// frontend/src/pages/ApiKeysPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Copy, Eye, CheckCircle2, AlertTriangle } from "lucide-react";
import { getApiKeys, createApiKey, revokeApiKey, getApiScopes } from "../api";
import { useT } from "../contexts/I18nContext";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

export default function ApiKeysPage() {
  const { t } = useT();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState(null);
  const [form, setForm] = useState({ name: "", scopes: [], expiresInDays: "" });
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const { data: keys = [], isLoading } = useQuery({ queryKey: ["apikeys", serverId], queryFn: () => getApiKeys(serverId) });
  const { data: scopes } = useQuery({ queryKey: ["apikey-scopes"], queryFn: getApiScopes });

  const createM = useMutation({
    mutationFn: (data) => createApiKey(serverId, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["apikeys", serverId] });
      setNewlyCreated(result);
      setCreating(false);
      setForm({ name: "", scopes: [], expiresInDays: "" });
    },
  });

  const revokeM = useMutation({
    mutationFn: (id) => revokeApiKey(serverId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apikeys", serverId] });
      setConfirmRevoke(null);
    },
  });

  const toggleScope = (scope) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newlyCreated?.key || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-8">
        <div>
          <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
            <Key className="w-7 h-7 text-cs-cyan" /> API Keys
          </h1>
          <p className="text-cs-muted mt-2 max-w-2xl">
            Create bearer tokens for the public REST API at <code className="text-cs-cyan">{window.location.origin}/public/v1</code>.
            Keys are shown only once at creation.
          </p>
        </div>
        <button onClick={() => { setCreating(true); setNewlyCreated(null); }} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden="true" /> New Key
        </button>
      </div>

      {/* ═══ Newly created key reveal ═══ */}
      {newlyCreated && (
        <div className="cs-card mb-6 border-2 border-green-500/50 bg-green-500/10" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="text-cs-text font-bold">Key created: {newlyCreated.name}</h2>
              <p className="text-xs text-warning mt-1 mb-3">
                ⚠️ {newlyCreated.warning}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-cs-black border border-green-500/30 px-3 py-2 text-xs font-mono text-green-300 rounded break-all">
                  {newlyCreated.key}
                </code>
                <button onClick={copyKey} className="cs-btn-primary flex items-center gap-2" aria-label={t("apikeys.copyKey")}>
                  {copied ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span role="status" className="sr-only">{copied ? "API key copied to clipboard" : ""}</span>
              <button onClick={() => setNewlyCreated(null)} className="text-xs text-cs-dim hover:text-white mt-3">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Create form ═══ */}
      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createM.mutate({
              name: form.name,
              scopes: form.scopes,
              expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : undefined,
            });
          }}
          className="cs-card mb-6 space-y-4"
        >
          <label className="block">
            <span className="text-xs text-cs-muted uppercase tracking-wider font-mono block mb-1">Name</span>
            <input required className="cs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("apikeys.ph.name")} />
          </label>

          <fieldset>
            <legend className="text-xs text-cs-muted uppercase tracking-wider font-mono block mb-2">Scopes</legend>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(scopes?.scopes || []).map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-cs-text">
                  <input type="checkbox" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} className="accent-cs-cyan" />
                  <code className="text-xs">{s}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs text-cs-muted uppercase tracking-wider font-mono block mb-1">Expires in (days, optional)</span>
            <input type="number" min={1} max={3650} className="cs-input" value={form.expiresInDays}
              onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}
              placeholder={t("apikeys.ph.expiry")} />
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="cs-btn-secondary">Cancel</button>
            <button type="submit" className="cs-btn-primary" disabled={createM.isPending || !form.name || !form.scopes.length}>
              {createM.isPending ? "Creating…" : "Create Key"}
            </button>
          </div>
        </form>
      )}

      {/* ═══ Keys list ═══ */}
      {isLoading && (
        <div className="cs-card h-20 animate-pulse" role="status">
          <span className="sr-only">Loading API keys…</span>
        </div>
      )}
      {!isLoading && !keys.length && !creating && (
        <EmptyState
          icon={Key}
          title={t("apikeys.empty.title")}
          description={t("apikeys.empty.body")}
          ctaLabel={t("apikeys.empty.cta")}
          onCtaClick={() => setCreating(true)}
        />
      )}

      <div className="space-y-3">
        {keys.map((k) => (
          <div key={k.id} className="cs-card flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-cs-text font-bold">{k.name}</span>
                {k.expiresAt && new Date(k.expiresAt) < new Date()
                  ? <span className="cs-badge text-danger">Expired</span>
                  : <span className="cs-badge text-success">Active</span>}
              </div>
              <code className="text-xs font-mono text-cs-dim">{k.keyPrefix}…</code>
              <div className="flex items-center gap-4 text-xs text-cs-muted mt-1 flex-wrap">
                <span>Scopes: {k.scopes.join(", ")}</span>
                {k.lastUsedAt && <span>Last used: {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                {k.expiresAt && <span>Expires: {new Date(k.expiresAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <button
              onClick={() => setConfirmRevoke(k)}
              className="text-danger hover:text-red-300 p-2"
              aria-label={`Revoke API key ${k.name}`}
              title={t("apikeys.revoke")}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {/* ═══ API docs teaser ═══ */}
      <div className="cs-card mt-8 bg-cs-surface">
        <h2 className="text-cs-text font-bold mb-2">Quick start</h2>
        <pre className="text-xs font-mono bg-cs-black p-3 rounded overflow-x-auto text-cs-cyan">{`curl ${window.location.origin}/public/v1/tickets \\
  -H "Authorization: Bearer bpk_live_..."`}</pre>
        <p className="text-xs text-cs-dim mt-2">{t("ui.hint.rateLimit")}</p>
      </div>

      <ConfirmDialog
        open={!!confirmRevoke}
        title={t("apikeys.revokeTitle")}
        message={confirmRevoke ? `Revoke "${confirmRevoke.name}"? This cannot be undone.` : ""}
        confirmLabel="Revoke Key"
        destructive
        loading={revokeM.isPending}
        onConfirm={() => confirmRevoke && revokeM.mutate(confirmRevoke.id)}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
