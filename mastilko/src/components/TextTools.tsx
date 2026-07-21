"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { fixBgTypography } from "@/lib/bg-typography";

// Помощни инструменти за текстово поле: диктовка (глас→текст) и български
// типографски автокоректор. Диктовката ползва Web Speech API на браузъра —
// при някои браузъри (напр. Chrome) звукът се обработва от доставчика на
// браузъра; затова стои изрична бележка (както при AI бутоните).

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function TextTools({ value, onChange }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => recRef.current?.stop?.();
  }, []);

  function toggleDictation() {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "bg-BG";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) add += e.results[i][0].transcript;
      }
      add = add.trim();
      if (!add) return;
      const next = (valueRef.current ? valueRef.current + " " : "") + add;
      valueRef.current = next;
      onChange(next);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => onChange(fixBgTypography(value))}
        >
          <Icon name="sparkles" className="h-4 w-4" /> Оправи типографията
        </button>
        {supported && (
          <button
            type="button"
            className={`btn-secondary text-sm ${listening ? "!text-tera-dark" : ""}`}
            onClick={toggleDictation}
            aria-pressed={listening}
          >
            <Icon name="bulb" className="h-4 w-4" /> {listening ? "Спри диктовката" : "Диктувай"}
          </button>
        )}
      </div>
      {supported && (
        <p className="mt-1 text-xs text-ink-faint">
          Диктовката ползва разпознаването на реч на браузъра ти — при някои
          браузъри (напр. Google Chrome) звукът напуска устройството и се
          обработва на сървъри на доставчика (Google). Каквото продиктуваш —
          включително лични данни — минава през тях. Ако предпочиташ, пиши на ръка.
        </p>
      )}
    </div>
  );
}
