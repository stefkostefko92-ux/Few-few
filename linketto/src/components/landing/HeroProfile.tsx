import {
  ClockIcon,
  GlobeIcon,
  LockIcon,
  ShoppingBagIcon,
} from "@/components/icons";

// „Профилът, който говори“: една профил-карта, която сменя езика си —
// самата идея на продукта, показана вместо описана. Чист CSS (globals.css
// → .lang-cycle): шест слоя се редуват с мек преход, ~0,28 Hz, само
// opacity/transform. Картата е илюстрация (aria-hidden) — не твърдение за
// реален клиент; под нея има бутон за пауза (WCAG 2.2.2).

// [код, био, [снимки, сесия, магазин]] — примерно съдържание на демо профил
const LANGS = [
  [
    "BG",
    "Фотограф от София. Портрети и сватби.",
    ["Моите снимки", "Резервирай сесия", "Магазин"],
  ],
  [
    "EN",
    "Photographer based in Sofia. Portraits and weddings.",
    ["My photos", "Book a session", "Shop"],
  ],
  [
    "IT",
    "Fotografa a Sofia. Ritratti e matrimoni.",
    ["Le mie foto", "Prenota una sessione", "Negozio"],
  ],
  [
    "ES",
    "Fotógrafa en Sofía. Retratos y bodas.",
    ["Mis fotos", "Reservar sesión", "Tienda"],
  ],
  [
    "DE",
    "Fotografin in Sofia. Porträts und Hochzeiten.",
    ["Meine Fotos", "Termin buchen", "Shop"],
  ],
  [
    "FR",
    "Photographe à Sofia. Portraits et mariages.",
    ["Mes photos", "Réserver une séance", "Boutique"],
  ],
] as const;

const ICONS = [GlobeIcon, ClockIcon, ShoppingBagIcon] as const;

const layer = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function HeroProfile({
  url,
  caption,
  pauseLabel,
}: {
  url: string;
  caption: string;
  pauseLabel: string;
}) {
  return (
    <figure className="lang-cycle relative mx-auto w-full max-w-[22rem]">
      {/* два „слоя“ зад картата — дълбочина без декоративен шум */}
      <div aria-hidden className="relative">
        <div className="absolute inset-x-6 -bottom-3 top-6 rounded-panel border border-line bg-surface-2" />
        <div className="absolute inset-x-3 -bottom-1.5 top-3 rounded-panel border border-line bg-surface" />
        <div className="relative rounded-panel border border-line bg-surface p-5 shadow-e3">
          <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-1.5 text-micro font-medium text-fg-muted">
            <LockIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{url}</span>
          </div>

          <div className="mt-6 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent-text to-accent text-[1.5rem] font-bold text-accent-fg ring-4 ring-surface-3">
              A
            </div>
            <p className="mt-3 text-subheading text-fg">Anna</p>

            <div className="mt-3 flex gap-1">
              {LANGS.map(([code], i) => (
                <span
                  key={code}
                  style={layer(i)}
                  className="lang-pill relative rounded-full px-2 py-0.5 text-micro font-bold text-fg-muted"
                >
                  <span className="relative">{code}</span>
                </span>
              ))}
            </div>

            <div className="mt-3 grid h-10 w-full">
              {LANGS.map(([code, bio], i) => (
                <p
                  key={code}
                  style={layer(i)}
                  className="lang-layer col-start-1 row-start-1 text-small text-fg-2"
                >
                  {bio}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {ICONS.map((Icon, row) => (
              <div
                key={row}
                className="grid h-11 items-center rounded-control border border-line-strong bg-surface-2 px-4"
              >
                <Icon className="col-start-1 row-start-1 h-4 w-4 justify-self-start text-accent-text" />
                {LANGS.map(([code, , labels], i) => (
                  <span
                    key={code}
                    style={layer(i)}
                    className="lang-layer col-start-1 row-start-1 justify-self-center text-small font-semibold text-fg"
                  >
                    {labels[row]}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="relative mt-8 flex items-center justify-between gap-4 text-small text-fg-muted">
        <span>{caption}</span>
        <span>
          <input
            type="checkbox"
            id="lang-pause"
            className="peer sr-only"
            aria-label={pauseLabel}
          />
          <label
            htmlFor="lang-pause"
            className="focus-ring cursor-pointer whitespace-nowrap rounded-control border border-line bg-surface px-2.5 py-1 text-micro font-semibold text-fg-2 transition-colors hover:bg-surface-3 peer-checked:bg-accent-soft peer-checked:text-accent-soft-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
          >
            {pauseLabel}
          </label>
        </span>
      </figcaption>
    </figure>
  );
}
