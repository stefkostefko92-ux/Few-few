/**
 * Транзакционен имейл. Не е удобство — обещали сме го публично:
 *
 *  - чл. 16, ал. 4 DSA: потвърждение за получаване на сигнал, БЕЗ забавяне;
 *  - чл. 16, ал. 5 и чл. 17 DSA: уведомяване за решението с мотиви и с
 *    информация за оспорване;
 *  - Общите условия: „ще пишем на посочения имейл след прегледа“.
 *
 * Без ключ функцията е **тиха no-op, която ЛОГВА** — така на машина за
 * разработка нищо не се праща, но липсата не минава незабелязано. Мълчалив
 * no-op би създал точно илюзията, че обещанието се изпълнява.
 */

const API = 'https://api.resend.com/emails';

export type Mail = { to: string; subject: string; body: string };

function sender(): string {
  return process.env.EMAIL_FROM ?? 'FiveM BG <no-reply@fivembulgaria.carbonstealth.eu>';
}

/** Никога не хвърля: неизпратен имейл не бива да отменя взето решение. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] няма RESEND_API_KEY — не е изпратено до ${mail.to}: ${mail.subject}`);
    return false;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: sender(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.body,
      }),
    });
    if (!res.ok) {
      console.error(`[email] доставчикът върна ${res.status} за ${mail.subject}`);
      await res.body?.cancel();
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] изпращането се провали', error);
    return false;
  }
}

const CONTACT = 'info@carbonstealth.eu';

/** Потвърждение за получен сигнал — чл. 16, ал. 4 DSA, без забавяне. */
export function reportReceipt(targetUrl: string): Omit<Mail, 'to'> {
  return {
    subject: 'Получихме сигнала ти — FiveM BG',
    body: `Здравей,

Получихме сигнала ти за съдържание на адрес:
${targetUrl}

Ще го разгледаме своевременно, добросъвестно и без произвол. Ще ти пишем
отново, когато има решение, заедно с информация как да го оспориш.

Това е потвърждение за получаване по чл. 16, ал. 4 от Регламент (ЕС) 2022/2065.

FiveM BG · ${CONTACT}`,
  };
}

/** Решение по сигнал — чл. 16, ал. 5 DSA, с пътищата за оспорване. */
export function reportDecision(targetUrl: string, upheld: boolean): Omit<Mail, 'to'> {
  return {
    subject: 'Решение по сигнала ти — FiveM BG',
    body: `Здравей,

Разгледахме сигнала ти за:
${targetUrl}

Решение: ${upheld ? 'сигналът е основателен и съдържанието е свалено' : 'сигналът е неоснователен и съдържанието остава'}.

Решението е взето от човек, без автоматизирани средства.

Ако не си съгласен, можеш да ни отговориш на този имейл, да подадеш жалба до
Комисията за регулиране на съобщенията като координатор на цифровите услуги,
или да потърсиш защита по съдебен ред.

FiveM BG · ${CONTACT}`,
  };
}

/**
 * Решение по заявка за листване. При отказ текстът е мотивирано решение по
 * чл. 17 DSA — задължението отпада само когато контактите на подателя НЕ са
 * известни, а тук са: имейлът е задължително поле във формата.
 */
export function submissionDecision(
  serverName: string,
  approved: boolean,
  reason = '',
): Omit<Mail, 'to'> {
  return {
    subject: approved ? `${serverName} е публикуван — FiveM BG` : `Заявката за ${serverName} — FiveM BG`,
    body: approved
      ? `Здравей,

Сървърът „${serverName}“ вече е публикуван в директорията.

Ако нещо в листинга не е точно — рамка, етикети, описание, Discord — пиши ни и
ще го поправим.

FiveM BG · ${CONTACT}`
      : `Здравей,

Прегледахме заявката за „${serverName}“ и решихме да не я публикуваме.

ОГРАНИЧЕНИЕ И ОБХВАТ (чл. 17, ал. 3, б. „а“): заявката не се публикува в
директорията. Ограничението обхваща само този листинг — не засяга сървъра ти,
нито бъдеща нова заявка.

ФАКТИ И ОБСТОЯТЕЛСТВА (чл. 17, ал. 3, б. „б“):
${reason.trim() || '(модераторът не е вписал мотив — отговори на този имейл и ще ти го дадем писмено)'}

АВТОМАТИЗИРАНИ СРЕДСТВА (чл. 17, ал. 3, б. „в“): не са ползвани. Решението е
взето от човек.

ОСНОВАНИЕ (чл. 17, ал. 3, б. „г“ и „д“): раздел „Как модерираме“ от Общите
условия — https://fivembulgaria.carbonstealth.eu/bg/terms

ОСПОРВАНЕ (чл. 17, ал. 3, б. „е“): отговори на този имейл и ще преразгледаме.
Имаш право и на жалба до Комисията за регулиране на съобщенията като
координатор на цифровите услуги за България, както и на защита по съдебен ред.

Това е мотивирано решение по чл. 17 от Регламент (ЕС) 2022/2065.

FiveM BG · ${CONTACT}`,
  };
}
