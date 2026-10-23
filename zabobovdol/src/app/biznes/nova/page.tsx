import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { BusinessForm, type BusinessFormTarget } from "./BusinessForm";

// Чете от базата при поправка (?za=<slug>) — затова не се генерира при билда.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Добавете своя бизнес безплатно",
    description:
      "Магазин, заведение, занаят или услуга в Бобов дол? Добавете бизнеса си безплатно в каталога на „За Бобов дол“ — с телефон, адрес и работно време.",
    path: "/biznes/nova",
  }),
  keywords: [
    "добави бизнес Бобов дол",
    "безплатен каталог на фирми",
    "местен бизнес Бобов дол",
    "магазини и услуги Бобов дол",
    "работно време и телефон",
    "За Бобов дол",
    "Carbon Stealth",
  ],
};

const CRUMBS = [
  { name: "Местен бизнес", path: "/biznes" },
  { name: "Добавете своя бизнес", path: "/biznes/nova" },
];

async function findTarget(
  za: string | undefined,
): Promise<{ target: BusinessFormTarget; defaults: Record<string, string> } | null> {
  if (!za || !/^[a-z0-9-]{1,100}$/.test(za)) return null;
  try {
    const b = await prisma.business.findFirst({
      where: { slug: za, published: true },
      select: {
        slug: true,
        name: true,
        category: true,
        description: true,
        address: true,
        phone: true,
        hours: true,
        website: true,
        facebook: true,
      },
    });
    if (!b) return null;
    return {
      target: { slug: b.slug, name: b.name },
      defaults: {
        name: b.name,
        category: b.category,
        description: b.description,
        address: b.address,
        phone: b.phone,
        hours: b.hours,
        websiteUrl: b.website,
        facebook: b.facebook,
      },
    };
  } catch {
    return null;
  }
}

export default async function NewBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ za?: string }>;
}) {
  const { za } = await searchParams;
  const fix = await findTarget(za);

  return (
    <>
      <PageHero
        title={fix ? `Поправете данните за „${fix.target.name}“` : "Добавете своя бизнес безплатно"}
        intro={
          fix
            ? "Поправете това, което не е вярно, и изпратете. Ще проверим и ще обновим каталога."
            : "Попълнете формата. Ще се свържем с вас, за да проверим данните, и след това бизнесът ви ще се появи в каталога. Безплатно е."
        }
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <BusinessForm target={fix?.target} defaults={fix?.defaults} />
      </div>
    </>
  );
}
