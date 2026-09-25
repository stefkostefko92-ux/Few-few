"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import ShareButton from "@/components/ShareButton";
import { BACKUPS_EVENT, pushBackup, readBackups, takeBackup, type Backup } from "@/lib/backups";

interface Props {
  /** Текущото състояние на редактора (записва се като JSON файл). */
  state: object;
  /** Извиква се с разчетените данни при качване на файл. */
  onLoad: (data: Record<string, unknown>) => void;
  /** Основа за името на файла, напр. „mastilko-vizitki“. */
  filename: string;
  /**
   * Ключът в localStorage, под който useLocalState пази проекта. Нужен е, за
   * да покажем „Предишни версии“ — копията преди отворен споделен линк. НЕ
   * съвпада винаги с `filename` (визитки: mastilko-cards / mastilko-vizitki).
   */
  storageKey?: string;
}

function when(b: Backup): string {
  if (!b.at) return "по-стара версия";
  const d = new Date(b.at);
  if (Number.isNaN(d.getTime())) return "по-стара версия";
  return d.toLocaleString("bg-BG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// Проектът живее само в браузъра (localStorage) — тези бутони позволяват да
// го свалиш като файл (бекъп / пренасяне на друго устройство) и да го качиш.
export default function ProjectFile({ state, onLoad, filename, storageKey }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);

  const refresh = useCallback(() => {
    if (!storageKey) return;
    try {
      setBackups(readBackups(localStorage, storageKey));
    } catch {
      setBackups([]);
    }
  }, [storageKey]);

  useEffect(() => {
    // localStorage е достъпен чак в браузъра — четем веднъж при монтиране…
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // …и наново, когато useLocalState добави копие. Ефектът на студиото (което
    // прави копието) минава СЛЕД този, защото ProjectFile е негово дете.
    const onBackup = (e: Event) => {
      if ((e as CustomEvent<string>).detail === storageKey) refresh();
    };
    window.addEventListener(BACKUPS_EVENT, onBackup);
    return () => window.removeEventListener(BACKUPS_EVENT, onBackup);
  }, [refresh, storageKey]);

  function restore(index: number) {
    if (!storageKey) return;
    const b = takeBackup(localStorage, storageKey, index);
    if (!b) return;
    // Връщането също е обратимо: текущият дизайн отива най-отпред в списъка,
    // иначе едно погрешно натискане би изтрило онова, което гледаш сега.
    try {
      pushBackup(localStorage, storageKey, JSON.stringify(state));
    } catch {
      /* пълно хранилище → връщаме, но без копие на текущото */
    }
    try {
      onLoad(JSON.parse(b.data) as Record<string, unknown>);
      setMsg(`Върнах версията от ${when(b)}.`);
    } catch {
      setMsg("Това копие е повредено и не може да се върне.");
    }
    refresh();
  }

  function download() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.mastilko.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    setMsg(null);
    try {
      const data: unknown = JSON.parse(await file.text());
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("bad");
      }
      onLoad(data as Record<string, unknown>);
      setMsg("Проектът е зареден.");
    } catch {
      setMsg("Файлът не прилича на проект от Мастилко.");
    }
  }

  return (
    <div className="no-print card-warm p-4">
      <p className="text-sm text-ink-soft">
        Работата ти се пази само в този браузър. Свали си файл за всеки
        случай — или го качи на друго устройство.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={download} className="btn-secondary text-sm">
          <Icon name="download" className="h-4 w-4" /> Свали проекта
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-secondary text-sm"
        >
          <Icon name="upload" className="h-4 w-4" /> Качи проект
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Файл с проект на Мастилко"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-2">
        <ShareButton state={state} />
      </div>
      {backups.length > 0 && (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <p className="text-sm font-semibold text-ink">Предишни версии</p>
          <p className="text-xs text-ink-soft">
            Проектът ти отпреди да отвориш споделен линк. Пазят се само в този браузър.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {backups.map((b, i) => (
              <li key={`${b.at}-${i}`}>
                <button type="button" onClick={() => restore(i)} className="btn-secondary text-sm">
                  Върни версията от {when(b)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-ink-soft">
        {msg}
      </p>
    </div>
  );
}
