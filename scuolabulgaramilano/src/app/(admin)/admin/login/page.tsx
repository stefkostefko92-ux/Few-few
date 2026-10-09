import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session) redirect(next || "/admin");
  return (
    <div className="ad-login">
      <div className="ad-login__card">
        <img src="/assets/img/brand/logo.webp" alt="Qui Bulgaria" />
        <h1>Административен панел</h1>
        <p>Влезте, за да управлявате съдържанието, снимките и запитванията на сайта.</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
