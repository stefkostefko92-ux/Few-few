"use client";

// Бутон за окончателно изтриване с потвърждение. Отделен от DeleteButton, защото
// тук действието е за много записи наведнъж и целта трябва да е голяма (≥44px).
export function DeleteNotNewsButton({
  action,
  count,
}: {
  action: () => void | Promise<void>;
  count: number;
}) {
  const what = count === 1 ? "1 запис, който не е новина" : `${count} записа, които не са новини`;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Ще изтриете ${what}. Действието е необратимо. Продължавате ли?`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn-secondary min-h-11 text-red-700">
        {count === 1 ? "Изтрий този запис" : `Изтрий тези ${count} записа`}
      </button>
    </form>
  );
}
