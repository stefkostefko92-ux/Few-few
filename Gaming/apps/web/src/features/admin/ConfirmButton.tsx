import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "../../ui";

/**
 * Разрушително действие с потвърждение в самия UI (без `window.confirm`):
 * първото натискане показва въпрос + „Да“/„Отказ“; действието тръгва едва след „Да“.
 */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  busy,
  disabled,
  className,
}: {
  label: ReactNode;
  question?: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button
        variant="ghost"
        disabled={disabled}
        loading={busy}
        onClick={() => setAsking(true)}
        className={cn("!text-loss", className)}
      >
        {label}
      </Button>
    );
  }
  return (
    <span role="group" className="inline-flex flex-wrap items-center gap-2 text-xs text-loss">
      <span>{question ?? t("admin.confirmQuestion", "Сигурен ли си?")}</span>
      <Button
        loading={busy}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="!bg-loss !from-loss !to-loss !px-3 !py-1 text-xs text-white"
      >
        {t("admin.confirmYes", "Да")}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)} className="!px-3 !py-1 text-xs">
        {t("admin.cancel", "Отказ")}
      </Button>
    </span>
  );
}
