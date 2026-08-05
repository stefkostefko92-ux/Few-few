import Link from "next/link";

import { Card } from "@/components/DataCard";
import SearchForm from "@/components/SearchForm";

export default function NotFound() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">Няма такава страница</h1>
      <p className="text-text-muted">Провери адреса или започни нова справка.</p>
      <Card title="Провери IP адрес">
        <SearchForm />
      </Card>
      <p className="text-sm">
        <Link href="/" className="text-accent underline underline-offset-2">
          ← Към началото
        </Link>
      </p>
    </div>
  );
}
