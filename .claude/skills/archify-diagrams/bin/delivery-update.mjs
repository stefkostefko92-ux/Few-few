// delivery-update.mjs — ТИХ STUB (Carbon Stealth VCC, адаптация на archify @ e37848822238).
// Оригиналът пускаше дъщерен процес, който теглеше манифест за обновления от tt-a1i.github.io
// (мрежов канал + отдалечен текст в контекста на агента). Махнат е по условие на втория преглед:
// обновяване минава САМО през нашия път за приемане (ново закотвяне на SHA), никога по мрежа.
// Запазваме сигнатурата, за да работи вносът в bin/finalize.mjs — винаги „изключено“.
export function startDeliveryUpdateCheck() {
  return Promise.resolve({
    status: "unavailable", installedVersion: null, availableVersion: null,
    releaseNotes: null, checkedAt: null, source: null,
    noticeRequired: false, noticeText: null, reason: "disabled",
  });
}
