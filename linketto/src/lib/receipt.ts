// Разписка/потвърждение за покупка на дигитален продукт. Печатната
// страница (/u/[slug]/receipt) я ползва, а имейлът линква към нея.
// Правно-чувствителните текстове са родни само за 6-те езика (bg е
// източникът); липсващ език пада към en — НИКОГА не се машинно превеждат.
//
// Роля на Linketto (TAX.md): договорът е между купувача и създателя, но
// за целите на ДДС платформата е доставчик по презумпция (чл. 9а Регл.
// 282/2011) — начислява и отчита ДДС по държавата на купувача. Това е и
// „документ за регистриране на продажбата" (Н-18, непрекъсната номерация)
// на траен носител — НЕ данъчна фактура.

export interface ReceiptStrings {
  title: string;
  seller: string;
  platform: string;
  buyer: string;
  date: string;
  orderId: string;
  item: string;
  amount: string;
  vat: string;
  net: string;
  discount: string;
  vatNote: string;
  traderYes: string;
  traderNo: string;
  print: string;
  refunded: string;
  processing: string;
  notFound: string;
}

const STRINGS: Record<string, ReceiptStrings> = {
  bg: {
    title: 'Потвърждение за покупка',
    seller: 'Продавач',
    platform: 'Платформа',
    buyer: 'Купувач',
    date: 'Дата',
    orderId: 'Номер на поръчка',
    item: 'Продукт',
    amount: 'Платена сума',
    vat: 'ДДС',
    net: 'Нето (без ДДС)',
    discount: 'Приложен промо код',
    vatNote:
      'Договорът за покупка се сключва между теб и създателя (продавача). За целите на ДДС Linketto (Carbon Stealth VCC) действа като доставчик по чл. 9а от Регламент за изпълнение (ЕС) 282/2011 и начислява и отчита дължимия ДДС по държавата на купувача. Показаната сума е крайната платена цена с включен ДДС, когато такъв се дължи. Този документ е потвърждение за покупка, не данъчна фактура.',
    traderYes: 'Продавачът е декларирал статут: търговец.',
    traderNo: 'Продавачът е декларирал статут: частно лице (непрофесионален продавач).',
    print: 'Принтирай / Запази като PDF',
    refunded: 'Тази покупка е възстановена.',
    processing: 'Покупката се обработва. Презареди тази страница след минута.',
    notFound: 'Разписката не е намерена.',
  },
  en: {
    title: 'Purchase confirmation',
    seller: 'Seller',
    platform: 'Platform',
    buyer: 'Buyer',
    date: 'Date',
    orderId: 'Order number',
    item: 'Product',
    amount: 'Amount paid',
    vat: 'VAT',
    net: 'Net (excl. VAT)',
    discount: 'Promo code applied',
    vatNote:
      "The purchase contract is concluded between you and the creator (seller). For VAT purposes Linketto (Carbon Stealth VCC) acts as the deemed supplier under Article 9a of Implementing Regulation (EU) 282/2011 and charges and accounts for the VAT due based on the buyer's country. The amount shown is the final price paid, VAT included where due. This document is a purchase confirmation, not a tax invoice.",
    traderYes: 'The seller has declared their status: trader.',
    traderNo: 'The seller has declared their status: private individual (non-professional seller).',
    print: 'Print / Save as PDF',
    refunded: 'This purchase has been refunded.',
    processing: 'Your purchase is being processed. Reload this page in a minute.',
    notFound: 'Receipt not found.',
  },
  it: {
    title: 'Conferma di acquisto',
    seller: 'Venditore',
    platform: 'Piattaforma',
    buyer: 'Acquirente',
    date: 'Data',
    orderId: 'Numero ordine',
    item: 'Prodotto',
    amount: 'Importo pagato',
    vat: 'IVA',
    net: 'Netto (IVA esclusa)',
    discount: 'Codice promozionale applicato',
    vatNote:
      "Il contratto di acquisto si conclude tra te e il creator (venditore). Ai fini IVA, Linketto (Carbon Stealth VCC) agisce come fornitore presunto ai sensi dell'articolo 9 bis del regolamento di esecuzione (UE) n. 282/2011 e applica e versa l'IVA dovuta in base al Paese dell'acquirente. L'importo indicato è il prezzo finale pagato, IVA inclusa ove dovuta. Questo documento è una conferma di acquisto, non una fattura fiscale.",
    traderYes: 'Il venditore ha dichiarato il proprio status: professionista.',
    traderNo: 'Il venditore ha dichiarato il proprio status: privato (venditore non professionale).',
    print: 'Stampa / Salva come PDF',
    refunded: 'Questo acquisto è stato rimborsato.',
    processing: "L'acquisto è in elaborazione. Ricarica questa pagina tra un minuto.",
    notFound: 'Ricevuta non trovata.',
  },
  es: {
    title: 'Confirmación de compra',
    seller: 'Vendedor',
    platform: 'Plataforma',
    buyer: 'Comprador',
    date: 'Fecha',
    orderId: 'Número de pedido',
    item: 'Producto',
    amount: 'Importe pagado',
    vat: 'IVA',
    net: 'Neto (sin IVA)',
    discount: 'Código promocional aplicado',
    vatNote:
      'El contrato de compra se celebra entre tú y el creador (vendedor). A efectos del IVA, Linketto (Carbon Stealth VCC) actúa como proveedor presunto según el artículo 9 bis del Reglamento de Ejecución (UE) n.º 282/2011 y repercute y declara el IVA debido según el país del comprador. El importe mostrado es el precio final pagado, con el IVA incluido cuando corresponda. Este documento es una confirmación de compra, no una factura fiscal.',
    traderYes: 'El vendedor ha declarado su condición: profesional.',
    traderNo: 'El vendedor ha declarado su condición: particular (vendedor no profesional).',
    print: 'Imprimir / Guardar como PDF',
    refunded: 'Esta compra ha sido reembolsada.',
    processing: 'Tu compra se está procesando. Recarga esta página en un minuto.',
    notFound: 'Recibo no encontrado.',
  },
  de: {
    title: 'Kaufbestätigung',
    seller: 'Verkäufer',
    platform: 'Plattform',
    buyer: 'Käufer',
    date: 'Datum',
    orderId: 'Bestellnummer',
    item: 'Produkt',
    amount: 'Gezahlter Betrag',
    vat: 'USt.',
    net: 'Netto (ohne USt.)',
    discount: 'Angewendeter Gutscheincode',
    vatNote:
      'Der Kaufvertrag kommt zwischen dir und dem Creator (Verkäufer) zustande. Für Umsatzsteuerzwecke handelt Linketto (Carbon Stealth VCC) als fingierter Leistungserbringer nach Artikel 9a der Durchführungsverordnung (EU) Nr. 282/2011 und berechnet und führt die geschuldete Umsatzsteuer nach dem Land des Käufers ab. Der angezeigte Betrag ist der final gezahlte Preis, inklusive Umsatzsteuer, soweit diese anfällt. Dieses Dokument ist eine Kaufbestätigung, keine Steuerrechnung.',
    traderYes: 'Der Verkäufer hat seinen Status angegeben: Unternehmer.',
    traderNo: 'Der Verkäufer hat seinen Status angegeben: Privatperson (nicht gewerblicher Verkäufer).',
    print: 'Drucken / Als PDF speichern',
    refunded: 'Dieser Kauf wurde erstattet.',
    processing: 'Dein Kauf wird verarbeitet. Lade diese Seite in einer Minute neu.',
    notFound: 'Beleg nicht gefunden.',
  },
  fr: {
    title: "Confirmation d'achat",
    seller: 'Vendeur',
    platform: 'Plateforme',
    buyer: 'Acheteur',
    date: 'Date',
    orderId: 'Numéro de commande',
    item: 'Produit',
    amount: 'Montant payé',
    vat: 'TVA',
    net: 'Net (hors TVA)',
    discount: 'Code promo appliqué',
    vatNote:
      "Le contrat d'achat est conclu entre vous et le créateur (vendeur). Aux fins de la TVA, Linketto (Carbon Stealth VCC) agit en qualité de fournisseur présumé au titre de l'article 9 bis du règlement d'exécution (UE) n° 282/2011 et facture et reverse la TVA due selon le pays de l'acheteur. Le montant indiqué est le prix final payé, TVA comprise le cas échéant. Ce document est une confirmation d'achat, non une facture fiscale.",
    traderYes: 'Le vendeur a déclaré son statut : professionnel.',
    traderNo: 'Le vendeur a déclaré son statut : particulier (vendeur non professionnel).',
    print: 'Imprimer / Enregistrer en PDF',
    refunded: 'Cet achat a été remboursé.',
    processing: 'Votre achat est en cours de traitement. Rechargez cette page dans une minute.',
    notFound: 'Reçu introuvable.',
  },
};

export function receiptStrings(locale?: string): ReceiptStrings {
  return STRINGS[locale ?? 'bg'] ?? STRINGS.en;
}

/** Дата за разписката (ISO YYYY-MM-DD — стабилно и еднозначно). */
export function receiptDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
