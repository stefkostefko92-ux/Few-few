import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const session = await getSession();
  if (session) redirect(searchParams.next || "/admin");
  return (
    <div className="ad-login">
      <div className="ad-login__card">
        <img src="/assets/img/brand/logo.webp" alt="Qui Bulgaria" />
        <h1>Pannello di amministrazione</h1>
        <p>Accedi per gestire contenuti, immagini e richieste del sito.</p>
        <LoginForm next={searchParams.next} />
      </div>
    </div>
  );
}
