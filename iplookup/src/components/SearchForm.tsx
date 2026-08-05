"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { looksLikeHostname, parseIp } from "@/lib/ip";

/**
 * Полето за търсене. Валидира ВЕДНАГА в браузъра — не за сигурност (сървърът
 * пак проверява), а за да не тръгва заявка, която сигурно ще се върне с грешка.
 */
export default function SearchForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;

    const parsed = parseIp(raw);
    if (parsed) {
      setError(null);
      router.push(`/ip/${encodeURIComponent(parsed.normalized)}`);
      return;
    }
    if (looksLikeHostname(raw)) {
      setError("Това е домейн, не IP адрес. Засега проверяваме само адреси — въведи IPv4 или IPv6.");
      return;
    }
    setError("Това не е валиден IP адрес. Пример: 8.8.8.8 или 2606:4700::1111");
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor="ip" className="mb-2 block text-sm font-medium text-text-muted">
        IP адрес за проверка
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="ip"
          name="ip"
          className="field-input flex-1"
          placeholder="8.8.8.8 или 2606:4700::1111"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "ip-error" : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
        />
        <button type="submit" className="btn-primary sm:w-40">
          Провери
        </button>
      </div>
      {error ? (
        <p id="ip-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
