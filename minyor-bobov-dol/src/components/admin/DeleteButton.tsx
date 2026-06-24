"use client";

export function DeleteButton({
  action,
  label = "Изтрий",
  confirmText = "Сигурни ли сте? Действието е необратимо.",
}: {
  action: () => void | Promise<void>;
  label?: string;
  confirmText?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      <button
        type="submit"
        className="text-sm font-medium text-red-600 hover:underline"
      >
        {label}
      </button>
    </form>
  );
}
