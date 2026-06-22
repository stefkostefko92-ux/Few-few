import Link from "next/link";
import { PageHero } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <PageHero
        title="Страницата не е намерена"
        intro="Възможно е връзката да е стара или сгрешена."
      />
      <div className="container-content py-10">
        <Link href="/" className="btn-primary">
          Към началната страница
        </Link>
      </div>
    </>
  );
}
