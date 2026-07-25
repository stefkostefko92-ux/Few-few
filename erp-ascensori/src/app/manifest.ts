// PWA манифест.
//
// Не за да е „модерно": техникът работи в машинно помещение и в асансьорна
// шахта — места без покритие. Инсталираното приложение отваря на цял екран,
// пази обвивката офлайн и се стартира с една икона, вместо с адрес, набран на
// ръка в браузър с ръкавици.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Ascensori Enterprise",
    short_name: "ERP Ascensori",
    description: "Gestionale per imprese di manutenzione e installazione ascensori",
    // Езикът е на ПРОДУКТА, не на браузъра: интерфейсът е изцяло италиански.
    lang: "it-IT",
    dir: "ltr",
    start_url: "/dashboard",
    // `standalone` вместо `fullscreen`: часът и батерията остават видими, а те
    // имат значение за човек, който брои отработени часове в мазе.
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#116bb5",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        // Без maskable вариант Android изрязва иконата в кръг и отрязва краищата.
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ordini di lavoro",
        short_name: "Ordini",
        url: "/ordini",
      },
      {
        name: "Impianti",
        short_name: "Impianti",
        url: "/impianti",
      },
    ],
  };
}
