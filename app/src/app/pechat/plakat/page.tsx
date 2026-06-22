import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PrintButton } from "@/components/PrintButton";

export const metadata: Metadata = buildMetadata({
  title: "Плакат за разпечатване",
  description: "Плакат с портала и спешните телефони — за читалища, входове и общи помещения.",
  path: "/pechat/plakat",
});

export default function PlakatPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Плакат за разпечатване", path: "/pechat/plakat" })} />
      <div className="container-content py-10">
        <div className="no-print mb-6 flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Плакат за разпечатване
          </h1>
          <PrintButton label="Разпечатай плаката" />
        </div>

        <div className="print-sheet mx-auto max-w-2xl rounded-2xl border-2 border-brand-700 bg-white p-10 text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-brand-700 font-display text-4xl font-extrabold text-white">
            Д
          </div>
          <h2 className="font-display text-3xl font-extrabold text-slate-900">
            За Дупница
          </h2>
          <p className="mt-2 text-lg text-slate-700">
            Всичко важно за Дупница на едно място — телефони, дежурна аптека, ток и
            вода, помощ с е-услуги.
          </p>
          <p className="mt-6 font-display text-2xl font-extrabold text-brand-800">
            zadupnitsa.eu
          </p>
          <div className="mt-6 rounded-xl bg-red-50 p-4">
            <p className="text-lg font-bold text-red-800">Спешен телефон: 112</p>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Независим граждански проект. Не е официалният сайт на община Дупница.
          </p>
        </div>
      </div>
    </>
  );
}
