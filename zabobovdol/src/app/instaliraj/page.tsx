import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { ShareButton } from "@/components/ShareButton";
import { InstallButton } from "@/components/InstallBanner";
import { breakableAddress, withBreakableDomain } from "@/components/TrustCard";
import { buildMetadata, howToLd } from "@/lib/seo";
import { getPlayStoreUrl } from "@/lib/settings";
import { SITE } from "@/lib/site";
import {
  AndroidConfirmPicture,
  AndroidInstallItemPicture,
  AndroidMenuPicture,
  HomeScreenPicture,
  IphoneAddHomePicture,
  IphoneConfirmPicture,
  IphoneSharePicture,
  Step,
} from "./pictures";
import { ANDROID_STEPS, IPHONE_STEPS } from "./steps";
import { SECTION } from "@/lib/section-names";
import { UI_LABEL } from "@/lib/ui-labels";

// Чете адреса на Google Play от базата → не се генерира при билда.
export const dynamic = "force-dynamic";

const TITLE = "Сложете „За Бобов дол“ на телефона";
const DESCRIPTION =
  "Как да сложите „За Бобов дол“ като икона на началния екран на телефона — стъпка по стъпка, с картинки, за Android и iPhone. Безплатно и без регистрация.";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/instaliraj",
  keywords: [
    "За Бобов дол приложение",
    "икона на началния екран",
    "добави към начален екран iPhone",
    "инсталиране на приложение Android",
    "Бобов дол телефон",
    "Carbon Stealth",
  ],
});

// Само истински адрес в Google Play — нищо друго не се показва като бутон.
function playUrl(raw: string): string {
  return /^https:\/\/play\.google\.com\//i.test(raw) ? raw : "";
}

export default async function InstallPage() {
  const play = playUrl(await getPlayStoreUrl());

  return (
    <>
      <PageHero
        eyebrow={SECTION.site}
        title={TITLE}
        intro="Една икона на началния екран — и сайтът се отваря като приложение, без търсене и без да пишете адреса. Безплатно е и не иска регистрация."
        crumbs={[{ name: UI_LABEL.install, path: "/instaliraj" }]}
      />
      <JsonLd
        data={howToLd({
          name: "Как да сложите „За Бобов дол“ на телефон с Android",
          steps: [...ANDROID_STEPS],
          url: `${SITE.url}/instaliraj#android`,
        })}
      />
      <JsonLd
        data={howToLd({
          name: "Как да сложите „За Бобов дол“ на iPhone",
          steps: [...IPHONE_STEPS],
          url: `${SITE.url}/instaliraj#iphone`,
        })}
      />

      <div className="container-content space-y-10 py-10">
        <section className="space-y-4" aria-labelledby="izberete">
          <h2 id="izberete" className="section-title">
            Какъв телефон имате?
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <a href="#android" className="btn-secondary text-lg">
              Android (Samsung, Xiaomi, Huawei…)
            </a>
            <a href="#iphone" className="btn-secondary text-lg">
              iPhone
            </a>
          </div>
          {/* Появява се само ако телефонът позволява инсталиране с едно натискане. */}
          <InstallButton />
        </section>

        <section id="android" className="max-w-3xl space-y-4" aria-labelledby="android-zaglavie">
          <h2 id="android-zaglavie" className="section-title">
            Android
          </h2>
          <ol role="list" className="space-y-4">
            <Step n={1}>{withBreakableDomain(ANDROID_STEPS[0])}</Step>
            <Step n={2} picture={<AndroidMenuPicture />}>
              {ANDROID_STEPS[1]}
            </Step>
            <Step n={3} picture={<AndroidInstallItemPicture />}>
              {ANDROID_STEPS[2]}
            </Step>
            <Step n={4} picture={<AndroidConfirmPicture />}>
              {ANDROID_STEPS[3]}
            </Step>
            <Step n={5} picture={<HomeScreenPicture />}>
              {ANDROID_STEPS[4]}
            </Step>
          </ol>
          <p className="text-lg text-slate-700">
            Ползвате друг браузър (например Samsung Internet)? Потърсете в менюто му
            „Добави към начален екран“. Ако не го намирате — отворете сайта в Chrome.
          </p>
          {play && (
            <div className="panel">
              <p className="text-lg text-slate-800">
                Предпочитате магазина за приложения? Има и приложение в Google Play.
              </p>
              <a
                href={play}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-3 w-full text-lg sm:w-auto"
              >
                Изтеглете от Google Play
              </a>
            </div>
          )}
        </section>

        <section id="iphone" className="max-w-3xl space-y-4" aria-labelledby="iphone-zaglavie">
          <h2 id="iphone-zaglavie" className="section-title">
            iPhone
          </h2>
          <ol role="list" className="space-y-4">
            <Step n={1}>{withBreakableDomain(IPHONE_STEPS[0])}</Step>
            <Step n={2} picture={<IphoneSharePicture />}>
              {IPHONE_STEPS[1]}
            </Step>
            <Step n={3} picture={<IphoneAddHomePicture />}>
              {IPHONE_STEPS[2]}
            </Step>
            <Step n={4} picture={<IphoneConfirmPicture />}>
              {IPHONE_STEPS[3]}
            </Step>
            <Step n={5} picture={<HomeScreenPicture />}>
              {IPHONE_STEPS[4]}
            </Step>
          </ol>
          <p className="text-lg text-slate-700">
            На iPad бутонът „Сподели“ е горе вдясно, до адреса.
          </p>
        </section>

        <section className="max-w-3xl space-y-3" aria-labelledby="ne-stava">
          <h2 id="ne-stava" className="section-title">
            Ако не се получава
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-lg text-slate-800 marker:text-brand-600">
            <li>
              Отворили сте връзката от Viber или Facebook? Тези приложения показват сайта в свой
              прозорец, от който не може да се сложи икона. Натиснете менюто (⋯ или ⋮) и
              изберете „Отвори в браузъра“, после следвайте стъпките отгоре.
            </li>
            <li>
              Помолете дете, внук или съсед да го направи заедно с вас — отнема две минути.
              Ето и страница специално за тях:{" "}
              <Link href="/za-blizkite" className="link">
                „Сложете „За Бобов дол“ на телефона на мама“
              </Link>
              .
            </li>
            <li>
              Иконата не ви трябва? Сайтът работи и без нея — просто напишете{" "}
              <strong>{breakableAddress(SITE.domain)}</strong>.
            </li>
          </ul>
        </section>

        <section className="max-w-3xl space-y-3" aria-labelledby="spodeli-zaglavie">
          <h2 id="spodeli-zaglavie" className="section-title">
            Изпратете на близък
          </h2>
          <p className="text-lg text-slate-700">
            Знаете някого, на когото ще помогне? Изпратете му тази страница.
          </p>
          <ShareButton
            title={TITLE}
            text="Как да сложите „За Бобов дол“ на телефона — стъпка по стъпка, с картинки:"
            path="/instaliraj"
          />
        </section>
      </div>
    </>
  );
}
