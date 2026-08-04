"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/vhod", { method: "DELETE" }).catch(() => {});
    router.push("/vhod");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className="text-text-muted underline underline-offset-2 hover:text-text">
      Изход
    </button>
  );
}
