// frontend/src/site/DiscordReplay.jsx
// Hero-то на публичния сайт: един тикет в Discord, изигран веднъж при
// зареждане — посрещане от бота, съобщението на члена, автоматичният AI
// отговор с етикета си и човек от екипа, който поема. Това е единственото
// движение на страницата, което не е предизвикано от човека (умението
// frontend-design: „един оркестриран момент“).
//
// Дисциплина:
//  - Мястото е запазено (min-height) → нула CLS; съобщенията само влизат.
//  - prefers-reduced-motion → крайният кадър веднага, без таймери.
//  - Декоративна за екранен четец: целият пример има aria-label с описание на
//    случващото се, вътрешността е aria-hidden (иначе четецът изчита
//    таймстампове и бутони, които не правят нищо).
//  - Бутоните и етикетите на AI отговора са ТОЧНО тези на бота (виж
//    i18n/siteStrings.js) — демото не обещава нищо, което продуктът не прави.
import { useEffect, useState, useCallback } from "react";

const STEPS = 4;            // посрещане · член · AI · екип
const STEP_MS = [700, 1500, 2300, 3300];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function DiscordReplay({ d }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? STEPS : 0));
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) { setShown(STEPS); return undefined; }
    setShown(0);
    const timers = STEP_MS.map((ms, i) => setTimeout(() => setShown(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [run]);

  const replay = useCallback(() => setRun((r) => r + 1), []);
  const typing = shown < STEPS && shown !== 1; // ботът „пише“ преди свое съобщение

  return (
    <figure className="relative" aria-label={d.aria}>
      <div
        aria-hidden="true"
        className="rounded-xl overflow-hidden bg-site-channel border border-site-line shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"
      >
        {/* Заглавна лента на канала — както в Discord */}
        <div className="flex items-center gap-2 px-4 h-11 bg-site-rail border-b border-black/30 text-[15px]">
          <span className="text-site-steel text-lg leading-none">#</span>
          <span className="font-semibold text-site-chrome">ticket-0142</span>
        </div>

        {/* Всички съобщения са в DOM-а от начало (visibility: hidden, докато им дойде
            редът): височината е крайната от първия кадър → нула CLS на всяка ширина
            (измерено 25.09.2026: при min-height последното съобщение местеше
            страницата на телефон — CLS 0.098). */}
        <div className="relative px-4 py-4 space-y-4 text-[14.5px] leading-[1.45]">
          {(
            <Msg on={shown >= 1} who="Supreme" app avatar="bot" time={`${d.today} 19:42`}>
              <Embed bar="#8fe600" title="Ticket #0142" footer="Support · Ticket ID: 7f3a9c21">
                {d.welcome}
              </Embed>
              <div className="flex flex-wrap gap-2 mt-2">
                <DBtn tone="danger">🔒 Close</DBtn>
                <DBtn>👋 Claim</DBtn>
                <DBtn>📜 Transcript</DBtn>
              </div>
            </Msg>
          )}
          {(
            <Msg on={shown >= 2} who={d.member} avatar="member" time={`${d.today} 19:42`}>
              <p className="text-[#dbdee1]">{d.memberMsg}</p>
            </Msg>
          )}
          {(
            <Msg on={shown >= 3} who="Supreme" app avatar="bot" time={`${d.today} 19:42`}>
              <Embed bar="#5865f2" author={d.ai.author} title={d.ai.title} footer={d.ai.footer}>
                {d.aiMsg}
              </Embed>
            </Msg>
          )}
          {(
            <Msg on={shown >= 4} who={d.staff} staff avatar="staff" time={`${d.today} 19:43`}>
              <p className="text-[#dbdee1]">{d.staffMsg}</p>
            </Msg>
          )}
          {typing && (
            <div className="absolute left-4 bottom-2 flex items-center gap-2 pl-12 text-site-steel text-[13px] bg-site-channel/90 pr-2 rounded">
              <span className="site-typing inline-flex gap-1"><span>•</span><span>•</span><span>•</span></span>
              <span>{d.typing}</span>
            </div>
          )}
        </div>
      </div>
      <button type="button" onClick={replay} tabIndex={shown >= STEPS ? 0 : -1} aria-hidden={shown < STEPS}
        className={`mt-3 text-sm text-site-steel hover:text-site-chrome underline decoration-site-line underline-offset-4 ${shown >= STEPS ? "" : "invisible"}`}>
        {d.replay}
      </button>
    </figure>
  );
}

const AVATAR = {
  bot: "bg-[#0f1a05] ring-1 ring-site-supreme/40",
  member: "bg-[#c2410c]",
  staff: "bg-[#3b5bdb]",
};

function Msg({ on, who, app, staff, avatar, time, children }) {
  return (
    <div className={`flex gap-3 ${on ? "site-msg-in" : "invisible"}`}>
      <div className={`w-9 h-9 rounded-full flex-shrink-0 grid place-items-center overflow-hidden ${AVATAR[avatar]}`}>
        {avatar === "bot"
          ? <img src="/logo-emblem.png" alt="" width="36" height="36" className="w-9 h-9 object-cover" />
          : <span className="text-white text-sm font-semibold">{who.slice(0, 1)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-semibold ${staff ? "text-[#8ea1ff]" : "text-site-chrome"}`}>{who}</span>
          {app && <span className="text-[10px] font-semibold px-1 py-px rounded bg-[#5865f2] text-white leading-tight">APP</span>}
          <span className="text-xs text-site-steel">{time}</span>
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Embed({ bar, author, title, footer, children }) {
  return (
    <div className="rounded-md bg-[#232428] border-l-4 px-3 py-2.5 max-w-[30rem]" style={{ borderLeftColor: bar }}>
      {author && <div className="text-xs font-semibold text-site-chrome mb-1">{author}</div>}
      <div className="font-semibold text-site-chrome mb-1">{title}</div>
      <p className="text-[#dbdee1]">{children}</p>
      <div className="text-[11px] text-site-steel mt-2">{footer}</div>
    </div>
  );
}

function DBtn({ tone, children }) {
  const cls = tone === "danger" ? "bg-[#da373c]" : "bg-[#4e5058]";
  return <span className={`inline-flex items-center h-8 px-3 rounded-[3px] text-[13px] font-medium text-white ${cls}`}>{children}</span>;
}
