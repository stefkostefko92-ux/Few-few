// frontend/src/components/EmojiPicker.jsx
// Лек emoji picker (нула зависимости) — отварящ се box с категории и търсене.
// Ползва се в Reaction Roles за избор на emoji на десктоп (на телефон има
// системна клавиатура с emoji). Custom emojis (name:id) се пишат ръчно в
// текстовото поле — picker-ът покрива стандартните Unicode emoji.
import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { useT } from "../contexts/I18nContext";

const CATEGORIES = [
  {
    id: "smileys",
    emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","🙂","😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪","🤔","🤫","🤐","😐","😏","🙄","😬","😴","🤒","🤕","🤢","🥳","😎","🤓","🧐","😕","😟","😢","😭","😱","😤","😡","🤬","💀","👻","🤖","👽","💩","🤡"],
  },
  {
    id: "gestures",
    emojis: ["👍","👎","👌","🤌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤝","🙏","💪","👏","🙌","👐","🤲","✍️","💅","🫡","🫶"],
  },
  {
    id: "hearts",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️"],
  },
  {
    id: "symbols",
    emojis: ["✅","❌","❎","✔️","☑️","⭐","🌟","✨","💫","🔥","💥","⚡","💯","🎯","🏆","🥇","🥈","🥉","🎖️","🏅","🔔","🔕","📢","📣","⚠️","🚫","🔞","♻️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔶","🔷","▶️","⏸️","⏹️","🔺","🔻","➕","➖","➗","❓","❗","💬","💭"],
  },
  {
    id: "gaming",
    emojis: ["🎮","🕹️","🎲","🎰","🧩","♟️","🎳","🎪","🎨","🎭","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🃏","🀄","🎴"],
  },
  {
    id: "objects",
    emojis: ["📋","📌","📍","📎","🔗","🔒","🔓","🔑","🗝️","🛠️","🔧","🔨","⚙️","🧰","📦","📫","📮","🗳️","📅","📆","🗓️","⏰","⏳","💰","💎","🪙","💵","💳","🧾","📊","📈","📉","🛒","🎁","🎈","🎉","🎊","🪅","🏁","🚀","✈️","🚗","🏠","🌍","🌈","☀️","🌙","❄️","💧","🍕","🍔","🍟","🌮","🍿","🍩","🍪","☕","🍺","🏀","⚽","🏈","⚾","🎾","🏐","🏓","🥊"],
  },
  {
    id: "animals",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦉","🐺","🐗","🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍","🦖","🦕","🐙","🦀","🐬","🐳","🦈","🐊","🦓","🦍","🐘","🦒","🌵","🎄","🌲","🍀","🌸","🌹","🌻","🌴"],
  },
  {
    id: "flags",
    emojis: ["🇧🇬","🇩🇪","🇫🇷","🇮🇹","🇪🇸","🇳🇱","🇵🇱","🇬🇧","🇺🇸","🇺🇦","🇹🇷","🇬🇷","🇷🇴","🇷🇸","🇲🇰","🏳️","🏴","🏁","🚩","🏳️‍🌈"],
  },
];

export default function EmojiPicker({ onSelect, buttonLabel }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef(null);

  // Затваряне при клик извън или Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    // capture + stopPropagation: Modal слуша Escape СЪЩО в capture фаза, а той
    // е монтиран по-рано, значи щеше да спечели и да затвори ЦЕЛИЯ модал —
    // потребителят губеше несъхранената форма само защото е искал да откаже
    // избора на емоджи. Тук поглъщаме клавиша, докато picker-ът е отворен.
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (emoji) => {
    onSelect(emoji);
    setOpen(false);
    setFilter("");
  };

  return (
    <>
      <button
        type="button"
        aria-label={buttonLabel || t("emoji.open")}
        aria-expanded={open}
        title={t("emoji.pickForButton")}
        onClick={() => setOpen((o) => !o)}
        className="cs-btn-ghost p-1.5 border border-cs-border rounded"
      >
        <SmilePlus className="w-4 h-4 text-cs-cyan" aria-hidden="true" />
      </button>

      {/* Центриран overlay вместо absolute dropdown: старият вариант се
          позиционираше спрямо бутона и се РЕЖЕШЕ от overflow-а на модала
          (виждаше се клипнат под реда). Fixed + центриране го изважда над
          всичко и го отваря в средата на панела, независимо от контейнера. */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-cs-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            ref={rootRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("emoji.dialog")}
            className="w-full max-w-md max-h-[80vh] overflow-y-auto cs-card !p-4 shadow-cs-lift border border-cs-border bg-cs-panel"
          >
            <input
              autoFocus
              className="cs-input text-sm mb-3 w-full"
              placeholder={t("emoji.searchCategory")}
              aria-label={t("emoji.filterLabel")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {CATEGORIES
              .map((c) => ({ ...c, name: t(`emoji.cat.${c.id}`) }))
              .filter((c) => !filter || c.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
              .map((cat) => (
                <div key={cat.id} className="mb-3">
                  <div className="text-xs text-cs-dim mb-1.5">{cat.name}</div>
                  <div className="grid grid-cols-10 gap-0.5">
                    {cat.emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => pick(e)}
                        className="text-xl leading-none p-1.5 rounded hover:bg-cs-bg focus:bg-cs-bg"
                        aria-label={t("emoji.select", { e })}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            <p className="text-[10px] text-cs-dim mt-1">
              {t("emoji.customHint")} <code>name:id</code>.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
