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
        aria-label={buttonLabel || "Open emoji picker"}
        aria-expanded={open}
        title="Pick emoji"
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
            aria-label="Emoji picker"
            className="w-full max-w-md max-h-[80vh] overflow-y-auto cs-card !p-4 shadow-cs-lift border border-cs-border bg-cs-panel"
          >
            <input
              autoFocus
              className="cs-input text-sm mb-3 w-full"
              placeholder="Search category…"
              aria-label="Filter emoji categories"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {CATEGORIES
              .filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()))
              .map((cat) => (
                <div key={cat.name} className="mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cs-dim mb-1.5">{cat.name}</div>
                  <div className="grid grid-cols-10 gap-0.5">
                    {cat.emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => pick(e)}
                        className="text-xl leading-none p-1.5 rounded hover:bg-cs-bg focus:bg-cs-bg"
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
        </div>
      )}
    </>
  );
}
