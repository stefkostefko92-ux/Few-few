"use client";

// „За програмата“ — идентификация на софтуера, производителя, обекта и
// фискалното устройство на едно място (за проверяващ орган и за поддръжката).

import { Modal } from "./ui";
import type { ShellStatus } from "./shell-status";

const LICENSE_LABEL: Record<ShellStatus["license"]["status"], string> = {
  active: "Активен",
  expired: "Изтекъл",
  invalid: "Невалиден за тази каса",
  none: "Не е активиран",
};

const PLAN_LABEL: Record<string, string> = {
  monthly: "месечен",
  yearly: "годишен",
  lifetime: "безсрочен",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-1.5">
      <dt className="text-ink-400">{k}</dt>
      <dd className="font-medium text-ink-100 selectable">{v || "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-3 first:pt-0 border-b border-ink-800 last:border-0">
      <h3 className="text-sm font-bold text-ink-200 mb-1">{title}</h3>
      <dl className="text-sm">{children}</dl>
    </section>
  );
}

export function AboutDialog({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: ShellStatus | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="За програмата" wide>
      {!status ? (
        <p className="text-ink-400">Няма връзка със сървъра на касата. Опитайте отново след малко.</p>
      ) : (
        <div>
          <Section title="Софтуер">
            <Row k="Наименование" v={status.app.name} />
            <Row k="Версия" v={status.app.version} />
            <Row
              k="Вид"
              v="Софтуер за управление на продажбите в търговски обект (Наредба № Н-18, Приложение № 29)"
            />
            <Row k="Режим СУПТО" v={status.supto.mode ? "Включен (УНП на всеки бон)" : "Изключен"} />
          </Section>
          <Section title="Производител">
            <Row k="Наименование" v={status.app.manufacturer.name} />
            <Row k="ЕИК" v={status.app.manufacturer.eik} />
            <Row k="Адрес" v={status.app.manufacturer.address} />
            <Row k="Контакт" v={status.app.manufacturer.email} />
          </Section>
          <Section title="Търговски обект">
            <Row k="Търговец" v={status.store.name} />
            <Row k="ЕИК" v={status.store.eik} />
            <Row k="Обект" v={status.store.storeName} />
            <Row k="Адрес" v={[status.store.city, status.store.address].filter(Boolean).join(", ")} />
          </Section>
          <Section title="Фискално устройство">
            <Row k="Драйвер" v={status.fiscal.driver} />
            <Row k="Номер на ФУ" v={status.fiscal.serial} />
            <Row k="Номер на ФП" v={status.fiscal.fiscalMemory} />
            <Row k="Състояние" v={status.fiscal.ok ? "Свързано" : `Няма връзка — ${status.fiscal.detail}`} />
          </Section>
          <Section title="Лиценз">
            <Row
              k="Състояние"
              v={`${LICENSE_LABEL[status.license.status]}${
                status.license.plan ? `, ${PLAN_LABEL[status.license.plan] ?? status.license.plan}` : ""
              }`}
            />
            {status.license.expiresAt && (
              <Row k="Валиден до" v={new Date(status.license.expiresAt).toLocaleDateString("bg-BG")} />
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
