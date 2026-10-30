import type { ReactNode } from "react";

// Екранни снимки на телефона за стъпките „Сложи на телефона“: Chrome за Android и Safari за
// iPhone на истинския ни сайт, после началният екран с иконата. Генерират се от
// scripts/howto-mockups/gen-instaliraj.js (изход: public/instaliraj/*.png) — червеният контур
// и бележката показват къде да се натисне. Размерите са фиксирани → страницата не „скача“.
// Картинките дублират текста на стъпката, затова alt описва само какво се вижда.

const W = 446; // ширина на PNG при 1x
const ANDROID_H = 790;
const IPHONE_H = 812;

function Shot({ name, h, alt }: { name: string; h: number; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- готови PNG със зададени размери; next/image не е нужен
    <img
      src={`/instaliraj/${name}.png`}
      width={W}
      height={h}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-auto w-[200px] max-w-full shrink-0 rounded-2xl sm:w-[210px]"
    />
  );
}

/** Android, Chrome: трите точки горе вдясно. */
export function AndroidMenuPicture() {
  return (
    <Shot
      name="android-menu"
      h={ANDROID_H}
      alt="Телефон с Android: в Chrome е отворен сайтът „За Бобов дол“, а трите точки горе вдясно са обградени в червено."
    />
  );
}

/** Android, Chrome: менюто с „Инсталиране на приложението“ / „Добавяне към началния екран“. */
export function AndroidInstallItemPicture() {
  return (
    <Shot
      name="android-install-item"
      h={ANDROID_H}
      alt="Менюто на Chrome е отворено; редът „Инсталиране на приложението“ е обграден в червено."
    />
  );
}

/** Android: потвърждение в прозорчето. */
export function AndroidConfirmPicture() {
  return (
    <Shot
      name="android-confirm"
      h={ANDROID_H}
      alt="Прозорче „Инсталиране на приложението“ с иконата „За Бобов дол“; бутонът „Инсталиране“ е обграден в червено."
    />
  );
}

/** iPhone, Safari: бутонът „Сподели“ долу в средата. */
export function IphoneSharePicture() {
  return (
    <Shot
      name="iphone-share"
      h={IPHONE_H}
      alt="iPhone със Safari: долу в средата бутонът „Сподели“ — квадратче със стрелка нагоре — е обграден в червено."
    />
  );
}

/** iPhone: менюто „Сподели“ → „Добави към начален екран“. */
export function IphoneAddHomePicture() {
  return (
    <Shot
      name="iphone-add-home"
      h={IPHONE_H}
      alt="Менюто „Сподели“ на iPhone; редът „Добави към начален екран“ е обграден в червено."
    />
  );
}

/** iPhone: „Добави“ горе вдясно. */
export function IphoneConfirmPicture() {
  return (
    <Shot
      name="iphone-confirm"
      h={IPHONE_H}
      alt="Екранът „Добави към начален екран“ с иконата „За Бобов дол“; бутонът „Добави“ горе вдясно е обграден в червено."
    />
  );
}

/** Началният екран с новата икона (Android по подразбиране, iPhone с os="ios"). */
export function HomeScreenPicture({ os = "android" }: { os?: "android" | "ios" }) {
  return os === "ios" ? (
    <Shot
      name="home-iphone"
      h={IPHONE_H}
      alt="Началният екран на iPhone: иконата „За Бобов дол“ е сред другите приложения и е обградена в червено."
    />
  ) : (
    <Shot
      name="home-android"
      h={ANDROID_H}
      alt="Началният екран на Android: иконата „За Бобов дол“ е сред другите приложения и е обградена в червено."
    />
  );
}

// Една стъпка: номерът и текстът са винаги вляво (в една колона за всички
// стъпки), а картинката — вдясно; на телефон картинката е под текста.
export function Step({
  n,
  picture,
  children,
}: {
  n: number;
  picture?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="step-num" aria-hidden="true">
          {n}
        </span>
        <div className="min-w-0 pt-1 text-lg leading-relaxed text-slate-800">
          <span className="sr-only">Стъпка {n}. </span>
          {children}
        </div>
      </div>
      {picture && <div className="flex justify-center sm:shrink-0">{picture}</div>}
    </li>
  );
}
