// frontend/src/pages/CommandsPage.jsx
import { useState, useMemo } from "react";
import { useT } from "../contexts/I18nContext";
import { useQuery } from "@tanstack/react-query";
import { Search, BookOpen, Terminal, LayoutDashboard } from "lucide-react";
import { getCommandsCatalog } from "../api";

export default function CommandsPage() {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ["commands-catalog"],
    queryFn: getCommandsCatalog,
    staleTime: 1000 * 60 * 60, // 1 hour — catalog rarely changes
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !activeCategory) return catalog;

    return catalog
      .filter((cat) => !activeCategory || cat.category === activeCategory)
      .map((cat) => {
        if (!q) return cat;
        const commands = (cat.commands || []).filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.signature?.toLowerCase().includes(q)
        );
        const dashboardOnly = (cat.dashboardOnly || []).filter((f) =>
          f.feature.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
        );
        if (!commands.length && !dashboardOnly.length && !cat.category.toLowerCase().includes(q)) return null;
        return { ...cat, commands, dashboardOnly };
      })
      .filter(Boolean);
  }, [catalog, query, activeCategory]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-cs-cyan" /> Commands
        </h1>
        <p className="text-cs-muted mt-2 max-w-2xl">
          Every bot command and every dashboard feature, in one place.
          You can always run <code className="text-cs-cyan">/help</code> in Discord for the same reference.
        </p>
      </div>

      {/* Search */}
      <div className="cs-card mb-6 !p-3">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-cs-dim flex-shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commands.searchPlaceholder")}
            aria-label={t("commands.search")}
            className="flex-1 bg-transparent outline-none text-cs-text placeholder-cs-dim"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-cs-dim hover:text-white text-xs">{t("commands.clear")}</button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`cs-badge text-xs ${!activeCategory ? "bg-cs-cyan text-black" : "text-cs-muted hover:text-white"}`}
        >
          All
        </button>
        {catalog.map((cat) => (
          <button
            key={cat.category}
            onClick={() => setActiveCategory(cat.category === activeCategory ? null : cat.category)}
            className={`cs-badge text-xs ${activeCategory === cat.category ? "bg-cs-cyan text-black" : "text-cs-muted hover:text-white"}`}
          >
            {cat.icon} {cat.category}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="cs-card h-40 animate-pulse" role="status">
          <span className="sr-only">Loading commands…</span>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="cs-card text-center py-12 text-cs-muted">
          No commands match your search.
        </div>
      )}

      {/* Categories */}
      <div className="space-y-6">
        {filtered.map((cat) => (
          <div key={cat.category} className="cs-card">
            <div className="mb-4">
              <h2 className="cs-heading font-display text-cs-text text-xl font-bold">
                {cat.icon} {cat.category}
              </h2>
              <p className="text-sm text-cs-muted mt-1">{cat.description}</p>
            </div>

            {(cat.commands || []).length === 0 && (cat.dashboardOnly || []).length === 0 && (
              <p className="text-sm text-cs-dim italic">No commands — dashboard-only category.</p>
            )}

            {/* Slash commands */}
            {(cat.commands || []).map((cmd) => (
              <div key={cmd.name} className="py-3 border-b border-cs-border last:border-b-0">
                <div className="flex items-start gap-3">
                  <Terminal className="w-4 h-4 text-cs-cyan flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <code className="font-mono text-sm text-cs-cyan font-bold">{cmd.name}</code>
                      {cmd.permission && (
                        <span className="text-[10px] uppercase tracking-wider text-cs-dim">
                          {cmd.permission}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-cs-dim mt-1">{cmd.signature}</p>
                    <p className="text-sm text-cs-text mt-2">{cmd.description}</p>
                    {cmd.dashboard && (
                      <div className="flex items-start gap-2 mt-2 text-xs text-cs-muted">
                        <LayoutDashboard className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>Dashboard: {cmd.dashboard}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Dashboard-only features */}
            {(cat.dashboardOnly || []).map((feat, i) => (
              <div key={i} className="py-3 border-b border-cs-border last:border-b-0">
                <div className="flex items-start gap-3">
                  <LayoutDashboard className="w-4 h-4 text-cs-cyan flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-sm text-cs-text font-bold">{feat.feature}</span>
                      <span className="text-[10px] uppercase tracking-wider text-cs-cyan">Dashboard-only</span>
                    </div>
                    <p className="text-sm text-cs-text mt-2">{feat.description}</p>
                    <p className="text-xs text-cs-muted mt-2">{feat.dashboard}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
