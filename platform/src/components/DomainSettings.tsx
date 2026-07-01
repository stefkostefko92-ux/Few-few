"use client";

import { useState, useTransition } from "react";
import {
  setSubdomainAction,
  setCustomDomainAction,
  verifyDomainAction,
  setPublishedAction,
  setPremiumAction,
  type DomainResult,
} from "@/app/dashboard/sites/[slug]/settings/domain-actions";

type Init = {
  slug: string;
  apex: string;
  subdomain: string;
  customDomain: string;
  domainVerified: boolean;
  domainToken: string;
  published: boolean;
  premium: boolean;
  isOwner: boolean;
};

export function DomainSettings({ init }: { init: Init }) {
  const [sub, setSub] = useState(init.subdomain);
  const [domain, setDomain] = useState(init.customDomain);
  const [verified, setVerified] = useState(init.domainVerified);
  const [published, setPublished] = useState(init.published);
  const [premium, setPremium] = useState(init.premium);
  const [msg, setMsg] = useState<DomainResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<DomainResult>, after?: (r: DomainResult) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok && after) after(r);
    });

  const txtValue = init.domainToken ? `carbonstealth-verify=${init.domainToken}` : "";

  return (
    <div className="space-y-6">
      {/* Публикуване */}
      <section className="card space-y-3">
        <h2 className="font-medium text-white">Публикуване</h2>
        <label className="flex items-center gap-2 text-sm text-ink-200">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => {
              const val = e.target.checked;
              setPublished(val);
              run(() => setPublishedAction(init.slug, val));
            }}
          />
          Сайтът е публикуван (обслужва се на домейн/поддомейн)
        </label>
        <p className="text-[11px] text-ink-600">
          Публичният адрес винаги е достъпен и на{" "}
          <code className="text-ink-400">/site/{init.slug}</code>.
        </p>
      </section>

      {/* Наш поддомейн */}
      <section className="card space-y-3">
        <h2 className="font-medium text-white">Наш поддомейн (безплатно)</h2>
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder="напр. myrestaurant"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
          />
          <span className="whitespace-nowrap text-sm text-ink-400">.{init.apex}</span>
        </div>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          disabled={pending}
          onClick={() => run(() => setSubdomainAction(init.slug, sub))}
        >
          Запази поддомейна
        </button>
        {init.subdomain && (
          <p className="text-xs text-green-400">
            Активен:{" "}
            <a
              href={`https://${init.subdomain}.${init.apex}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {init.subdomain}.{init.apex}
            </a>
          </p>
        )}
      </section>

      {/* Собствен домейн */}
      <section className="card space-y-3">
        <h2 className="font-medium text-white">Собствен домейн</h2>
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <button
            className="btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(() => setCustomDomainAction(init.slug, domain), () => setVerified(false))}
          >
            Запази домейна
          </button>
        </div>

        {init.customDomain && (
          <div className="space-y-2 rounded-lg border border-ink-800 p-3 text-xs">
            {verified ? (
              <p className="text-green-400">
                ✓ {init.customDomain} е потвърден и активен.
              </p>
            ) : (
              <>
                <p className="text-amber-400">Добавете тези DNS записи при вашия регистратор:</p>
                <div className="space-y-2">
                  <div className="rounded bg-ink-950 p-2">
                    <p className="text-ink-500">1) Потвърждение на собствеността (TXT)</p>
                    <p className="text-ink-200">Тип: <b>TXT</b> · Име: <b>@</b> (или <b>_carbonstealth</b>)</p>
                    <p className="break-all text-ink-200">Стойност: <code>{txtValue}</code></p>
                  </div>
                  <div className="rounded bg-ink-950 p-2">
                    <p className="text-ink-500">2) Насочване към нас</p>
                    <p className="text-ink-200">
                      Поддомейн (www): <b>CNAME</b> → <code>{init.subdomain ? `${init.subdomain}.${init.apex}` : `<вашият-поддомейн>.${init.apex}`}</code>
                    </p>
                    <p className="text-ink-200">
                      Основен домейн (@): <b>A</b> → IP на сървъра (вижте документацията)
                    </p>
                  </div>
                </div>
                <button
                  className="btn-primary px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={() => run(() => verifyDomainAction(init.slug), () => setVerified(true))}
                >
                  {pending ? "Проверка…" : "Провери домейна"}
                </button>
                <p className="text-ink-600">
                  TLS сертификатът се издава автоматично при първо посещение (Caddy On-Demand TLS).
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {/* Премиум / воден знак */}
      <section className="card space-y-2">
        <h2 className="font-medium text-white">Премиум</h2>
        {premium ? (
          <p className="text-sm text-green-400">✓ Премиум — без воден знак „Carbon Stealth“.</p>
        ) : (
          <p className="text-sm text-ink-400">
            Безплатните сайтове показват малък воден знак „Създадено с Carbon Stealth“ във футъра.
          </p>
        )}
        {init.isOwner ? (
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => {
              const val = !premium;
              run(() => setPremiumAction(init.slug, val), () => setPremium(val));
            }}
          >
            {premium ? "Изключи премиум" : "Включи премиум"}
          </button>
        ) : (
          <p className="text-[11px] text-ink-600">Премиумът се управлява от собственика на платформата.</p>
        )}
      </section>

      {msg?.ok && <p className="text-sm text-green-400">{msg.ok}</p>}
      {msg?.error && <p className="text-sm text-red-400">{msg.error}</p>}
    </div>
  );
}
