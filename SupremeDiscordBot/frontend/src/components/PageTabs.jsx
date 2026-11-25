// frontend/src/components/PageTabs.jsx
// Разделите на една страница. Избраният раздел живее в адреса (?tab=…): връзка
// от търсенето, от документацията или от „Назад“ отваря точния раздел, а
// презареждането не връща на първия. Клавиатура по WAI-ARIA: стрелки, Home, End.
import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

/** [текущ раздел, смяна] — първият раздел е без параметър в адреса. */
export function useTab(ids, param = "tab") {
  const [params, setParams] = useSearchParams();
  const wanted = params.get(param);
  const current = ids.includes(wanted) ? wanted : ids[0];
  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === ids[0]) next.delete(param);
    else next.set(param, id);
    setParams(next, { replace: true });
  };
  return [current, setTab];
}

export default function PageTabs({ tabs, value, onChange, label }) {
  const refs = useRef({});
  const onKeyDown = (e) => {
    const i = tabs.findIndex((tb) => tb.id === value);
    const last = tabs.length - 1;
    const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 mb-6 border-b border-cs-border overflow-x-auto">
      {tabs.map((tb) => {
        const active = tb.id === value;
        return (
          <button
            key={tb.id}
            ref={(el) => { refs.current[tb.id] = el; }}
            type="button"
            role="tab"
            id={`tab-${tb.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${tb.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tb.id)}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${
              active ? "border-cs-cyan text-cs-cyan" : "border-transparent text-cs-muted hover:text-cs-text"
            }`}
          >
            {tb.icon && <tb.icon className="w-4 h-4" aria-hidden="true" />}
            {tb.label}
            {tb.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Съдържанието на избрания раздел. */
export function TabPanel({ id, children }) {
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
