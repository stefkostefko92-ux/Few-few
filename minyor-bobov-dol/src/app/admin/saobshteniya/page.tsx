import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setMessageHandled, deleteMessage } from "@/lib/admin/message-actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireAdmin();
  const { deleted } = await searchParams;
  const messages = await prisma.contactMessage.findMany({
    orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Съобщения от контакти</h1>
      <p className="text-slate-600">Запитвания, изпратени през формата за контакти.</p>

      {deleted && (
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
          Съобщението е изтрито.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          Няма получени съобщения.
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={
                "rounded-xl border bg-white p-5 " +
                (m.handled ? "border-slate-200" : "border-amber-300")
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {m.name}{" "}
                    <a href={`mailto:${m.email}`} className="font-normal text-brand-800 hover:underline">
                      &lt;{m.email}&gt;
                    </a>
                  </p>
                  {m.subject && <p className="text-sm font-medium text-slate-700">{m.subject}</p>}
                  <p className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat("bg-BG", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(m.createdAt)}
                    {!m.handled && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                        ново
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <form action={setMessageHandled.bind(null, m.id, !m.handled)}>
                    <button className="text-sm font-medium text-brand-800 hover:underline">
                      {m.handled ? "Върни като ново" : "Отбележи обработено"}
                    </button>
                  </form>
                  <DeleteButton action={deleteMessage.bind(null, m.id)} />
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
