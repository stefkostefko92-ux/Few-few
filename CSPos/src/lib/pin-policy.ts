// ПИН политика при смяна (КП-П.3). Входът приема всеки 4–8 цифрен ПИН, за да може шаблонният
// администратор да влезе с началния си ПИН; новият ПИН обаче не може да е лесен за отгатване.

function isRun(pin: string, step: 1 | -1): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) - Number(pin[i - 1]) !== step) return false;
  }
  return true;
}

/** null = ПИН-ът е приемлив; иначе съобщение за оператора. */
export function pinPolicyError(pin: string, oldPin?: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "ПИН кодът е от 4 до 8 цифри.";
  if (/^(\d)\1+$/.test(pin) || isRun(pin, 1) || isRun(pin, -1)) {
    return "ПИН кодът се отгатва твърде лесно (еднакви или поредни цифри). Изберете друг.";
  }
  if (oldPin !== undefined && pin === oldPin) return "Новият ПИН трябва да е различен от стария.";
  return null;
}
