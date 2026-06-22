import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { LoginForm } from "./LoginForm";
import { isAdminConfigured } from "@/lib/auth";

export const metadata: Metadata = buildMetadata({
  title: "Вход в администрацията",
  path: "/admin/login",
  noindex: true,
});

export default function AdminLoginPage() {
  return (
    <div className="container-content py-12">
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Администрация
      </h1>
      <p className="mt-2 text-base text-slate-600">
        Вход само за редактори на „За Дупница“.
      </p>
      <div className="mt-6">
        {isAdminConfigured() ? (
          <LoginForm />
        ) : (
          <p className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-slate-700">
            Администраторският достъп не е конфигуриран. Задайте променливите
            ADMIN_EMAIL, ADMIN_PASSWORD и SESSION_SECRET в средата.
          </p>
        )}
      </div>
    </div>
  );
}
