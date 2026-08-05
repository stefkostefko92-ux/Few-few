// frontend/src/components/EmojiPicker.jsx
// Лек emoji picker (нула зависимости) — отварящ се box с категории и търсене.
// Ползва се в Reaction Roles за избор на emoji на десктоп (на телефон има
// системна клавиатура с emoji). Custom emojis (name:id) се пишат ръчно в
// текстовото поле — picker-ът покрива стандартните Unicode emoji.
import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";

const CATEGORIES = [
  {
    name: "Smileys",
    emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","🙂","😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪","🤔","🤫","🤐","😐","😏","🙄","😬","😴","🤒","🤕","🤢","🥳","😎","🤓","🧐","😕","😟","😢","😭","😱","😤","😡","🤬","💀","👻","🤖","👽","💩","🤡"],
  },
  {
    name: "Gestures",
    emojis: ["👍","👎","👌","🤌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤝","🙏","💪","👏","🙌","👐","🤲","✍️","💅","🫡","🫶"],
  },
  {
    name: "Hearts",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️"],
  },
  {
    name: "Symbols",
    emojis: ["✅","❌","❎","✔️","☑️","⭐","🌟","✨","💫","🔥","💥","⚡","💯","🎯","🏆","🥇","🥈","🥉","🎖️","🏅","🔔","🔕","📢","📣","⚠️","🚫","🔞","♻️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔶","🔷","▶️","⏸️","⏹️","🔺","🔻","➕","➖","➗","❓","❗","💬","💭"],
  },
  {
    name: "Gaming & Fun",
    emojis: ["🎮","🕹️","🎲","🎰","🧩","♟️","🎳","🎪","🎨","🎭","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🃏","🀄","🎴"],
  },
  {
    name: "Objects & Activities",
    emojis: ["📋","📌","📍","📎","🔗","🔒","🔓","🔑","🗝️","🛠️","🔧","🔨","⚙️","🧰","📦","📫","📮","🗳️","📅","📆","🗓️","⏰","⏳","💰","💎","🪙","💵","💳","🧾","📊","📈","📉","🛒","🎁","🎈","🎉","🎊","🪅","🏁","🚀","✈️","🚗","🏠","🌍","🌈","☀️","🌙","❄️","💧","🍕","🍔","🍟","🌮","🍿","🍩","🍪","☕","🍺","🏀","⚽","🏈","⚾","🎾","🏐","🏓","🥊"],
  },
  {
    name: "Animals & Nature",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦉","🐺","🐗","🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍","🦖","🦕","🐙","🦀","🐬","🐳","🦈","🐊","🦓","🦍","🐘","🦒","🌵","🎄","🌲","🍀","🌸","🌹","🌻","🌴"],
  },
  {
    name: "Flags",
    emojis: ["🇧🇬","🇩🇪","🇫🇷","🇮🇹","🇪🇸","🇳🇱","🇵🇱","🇬🇧","🇺🇸","🇺🇦","🇹🇷","🇬🇷","🇷🇴","🇷🇸","🇲🇰","🏳️","🏴","🏁","🚩","🏳️‍🌈"],
  },
];

export default function EmojiPicker({ onSelect, buttonLabel }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef(null);

  // Затваряне при клик извън или Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (emoji) => {
    onSelect(emoji);
    setOpen(false);
    setFilter("");
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={buttonLabel || "Open emoji picker"}
        aria-expanded={open}
        title="Pick emoji"
        onClick={() => setOpen((o) => !o)}
        className="cs-btn-ghost p-1.5 border border-cs-border rounded"
      >
        <SmilePlus className="w-4 h-4 text-cs-cyan" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="absolute z-50 mt-1 right-0 w-72 max-h-80 overflow-y-auto cs-card !p-3 shadow-cs-lift border border-cs-border bg-cs-panel"
        >
          <input
            autoFocus
            className="cs-input text-sm mb-2 w-full"
            placeholder="Search category…"
            aria-label="Filter emoji categories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {CATEGORIES
            .filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()))
            .map((cat) => (
              <div key={cat.name} className="mb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cs-dim mb-1">{cat.name}</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => pick(e)}
                      className="text-lg leading-none p-1 rounded hover:bg-cs-bg focus:bg-cs-bg"
                      aria-label={`Select ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          <p className="text-[10px] text-cs-dim mt-1">
            Custom server emoji? Type it in the field as <code>name:id</code>.
          </p>
        </div>
      )}
    </div>
  );
}
