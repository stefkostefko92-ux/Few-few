// frontend/src/components/automation/shared.jsx
// Общото за разделите с анкети, раздавания, съобщения и роли с реакция.
import EmptyState from "../EmptyState";

// Провалена мутация ТРЯБВА да каже нещо. Тази страница беше системното
// изключение от конвенцията на приложението: 14 от 18 мутации нямаха onError и
// изобщо не внасяха toast — натискаш „Изтрий", заявката пада, нищо не се случва
// и нищо не пише. (Дизайнера, 07.08.2026)
export const mutErr = (err) => err?.response?.data?.error || null;

export function Empty({ msg, icon }) {
  return <EmptyState icon={icon} title={msg} className="!py-10" />;
}

export function ErrorCard({ msg }) {
  return (
    <div role="alert" className="cs-card text-center py-10 text-danger">{msg}</div>
  );
}
