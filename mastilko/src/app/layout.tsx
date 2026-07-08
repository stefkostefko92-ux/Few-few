import type { Metadata } from "next";
import {
  Manrope, Playfair_Display, Lora, Oswald, Caveat,
  Montserrat, Nunito, Nunito_Sans, Rubik, Comfortaa, PT_Serif, Merriweather,
  Prata, Yeseva_One, Russo_One, Pacifico, Marck_Script, JetBrains_Mono,
  Roboto, Open_Sans, Fira_Sans, PT_Sans, Ubuntu, Raleway, Inter, Mulish,
  Exo_2, Play, Golos_Text, Onest, Unbounded, Commissioner, Cuprum, Ruda,
  Cormorant, Alegreya, Vollkorn, Bitter, Old_Standard_TT, Literata, Noto_Serif,
  Spectral, Podkova, Philosopher, Marmelad, Rubik_Mono_One,
  Stalinist_One, Tenor_Sans, Underdog, Seymour_One, Bad_Script, Pangolin, Neucha,
  Lobster, Roboto_Mono, IBM_Plex_Mono, Source_Code_Pro, Anonymous_Pro,
  PT_Mono, Ubuntu_Mono,
} from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BannerZone from "@/components/BannerZone";
import "./globals.css";

// Всички шрифтове са с кирилица И латиница. Само основните два се preload-ват;
// останалите се свалят само когато потребител ги избере (preload: false).
// next/font иска ВСЕКИ зареждач да е присвоен на const в обхвата на модула
// (обектен литерал, без spread) — затова изброяваме поединично.

const sans = Manrope({ subsets: ["cyrillic", "latin"], display: "swap", variable: "--font-sans" });
const display = Playfair_Display({ subsets: ["cyrillic", "latin"], display: "swap", variable: "--font-display" });

// Безсерифни
const montserrat = Montserrat({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-montserrat" });
const roboto = Roboto({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-roboto" });
const opensans = Open_Sans({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-opensans" });
const inter = Inter({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-inter" });
const raleway = Raleway({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-raleway" });
const mulish = Mulish({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-mulish" });
const nunito = Nunito({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-nunito" });
const nunitosans = Nunito_Sans({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-nunitosans" });
const rubik = Rubik({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-rubik" });
const firasans = Fira_Sans({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-firasans" });
const ptsans = PT_Sans({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-ptsans" });
const ubuntu = Ubuntu({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-ubuntu" });
const oswald = Oswald({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-oswald" });
const comfortaa = Comfortaa({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-comfortaa" });
const exo2 = Exo_2({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-exo2" });
const play = Play({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-play" });
const golos = Golos_Text({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-golos" });
const onest = Onest({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-onest" });
const unbounded = Unbounded({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-unbounded" });
const commissioner = Commissioner({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-commissioner" });
const cuprum = Cuprum({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-cuprum" });
const ruda = Ruda({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-ruda" });

// Серифни
const lora = Lora({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-lora" });
const ptserif = PT_Serif({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-ptserif" });
const merriweather = Merriweather({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-merriweather" });
const cormorant = Cormorant({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-cormorant" });
const alegreya = Alegreya({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-alegreya" });
const vollkorn = Vollkorn({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-vollkorn" });
const bitter = Bitter({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-bitter" });
const oldstandard = Old_Standard_TT({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-oldstandard" });
const literata = Literata({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-literata" });
const notoserif = Noto_Serif({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-notoserif" });
const spectral = Spectral({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-spectral" });
const podkova = Podkova({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-podkova" });

// Ефектни
const prata = Prata({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-prata" });
const yeseva = Yeseva_One({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-yeseva" });
const russo = Russo_One({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-russo" });
const philosopher = Philosopher({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-philosopher" });
const marmelad = Marmelad({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-marmelad" });
const rubikmono = Rubik_Mono_One({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-rubikmono" });
const stalinist = Stalinist_One({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-stalinist" });
const tenor = Tenor_Sans({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-tenor" });
const underdog = Underdog({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-underdog" });
const seymour = Seymour_One({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-seymour" });

// Ръкописни
const pacifico = Pacifico({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-pacifico" });
const caveat = Caveat({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-caveat" });
const marck = Marck_Script({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-marck" });
const badscript = Bad_Script({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-badscript" });
const pangolin = Pangolin({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-pangolin" });
const neucha = Neucha({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-neucha" });
const lobster = Lobster({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-lobster" });

// Равноширок
const jetbrains = JetBrains_Mono({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-jetbrains" });
const robotomono = Roboto_Mono({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-robotomono" });
const ibmplex = IBM_Plex_Mono({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-ibmplex" });
const sourcecode = Source_Code_Pro({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, variable: "--font-sourcecode" });
const anonymous = Anonymous_Pro({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-anonymous" });
const ptmono = PT_Mono({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: "400", variable: "--font-ptmono" });
const ubuntumono = Ubuntu_Mono({ subsets: ["cyrillic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-ubuntumono" });

const FONT_VARS = [
  sans, display,
  montserrat, roboto, opensans, inter, raleway, mulish, nunito, nunitosans, rubik,
  firasans, ptsans, ubuntu, oswald, comfortaa, exo2, play, golos, onest, unbounded,
  commissioner, cuprum, ruda,
  lora, ptserif, merriweather, cormorant, alegreya, vollkorn, bitter, oldstandard,
  literata, notoserif, spectral, podkova,
  prata, yeseva, russo, philosopher, marmelad, rubikmono, stalinist, tenor, underdog, seymour,
  pacifico, caveat, marck, badscript, pangolin, neucha, lobster,
  jetbrains, robotomono, ibmplex, sourcecode, anonymous, ptmono, ubuntumono,
].map((f) => f.variable).join(" ");

const SITE_URL = "https://mastilko-bg.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Мастилко — безплатни етикети, визитки и CV за печат",
    template: "%s · Мастилко",
  },
  description:
    "Създай безплатно етикети, визитки и автобиография (CV) на български — направо в браузъра, без регистрация, готови за принтиране на А4.",
  keywords: [
    "етикети за печат",
    "безплатни етикети",
    "визитки онлайн",
    "CV на български",
    "Europass CV",
    "автобиография шаблон",
    "мотивационно писмо",
    "визитки с QR код",
    "принтиране А4",
    "Мастилко",
    "Carbon Stealth",
    "Carbon Stealth VCC",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "bg_BG",
    url: SITE_URL,
    siteName: "Мастилко",
    title: "Мастилко — безплатни етикети, визитки и CV за печат",
    description:
      "Етикети, визитки и CV на български — безплатно, без регистрация, готови за принтиране.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Мастилко — дизайн и печат: визитки, етикети, CV" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Мастилко — безплатни етикети, визитки и CV за печат",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className={FONT_VARS}>
      <head>
        {/* Прилага тъмната тема преди рисуване, за да няма трепване. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('mastilko-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <Header />
        <BannerZone placement="all" />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
