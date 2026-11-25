import { useTranslation } from "react-i18next";
import "./compact-table.css";

/** Card-count chip that stands in for a side seat's fan on phones (see
 *  compact-table.css): the fan itself does not fit next to the trick. */
export function SeatCount({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="aso-seat-count tnum"
      aria-label={`${count} × ${t("a11y.card")}`}
      data-count={count}
    >
      <span aria-hidden>🂠</span>
      {count}
    </span>
  );
}
