// Разписка/потвърждение за покупка на дигитален продукт. Печатната
// страница (/u/[slug]/receipt) я ползва, а имейлът линква към нея.
// Правно-чувствителните текстове са родни само за 6-те езика (bg е
// източникът); липсващ език пада към en — НИКОГА не се машинно превеждат.
//
// Роля на Linketto: платформа. Продавачът е merchant-of-record (Stripe
// Connect, on_behalf_of) — ДДС и фактурирането са негова отговорност; тук
// издаваме потвърждение за покупка на траен носител, не данъчна фактура.

export interface ReceiptStrings {
  title: string;
  seller: string;
  platform: string;
  buyer: string;
  date: string;
  orderId: string;
  item: string;
  amount: string;
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
    discount: 'Приложен промо код',
    vatNote:
      'Продавачът е доставчикът по документацията. Linketto е платформа-посредник; продавачът предоставя съдържанието и носи отговорността за ДДС и данъчна фактура, ако такава се дължи.',
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
    discount: 'Promo code applied',
    vatNote:
      'The seller is the supplier of record. Linketto is an intermediary platform; the seller provides the content and is responsible for VAT and any tax invoice due.',
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
    discount: 'Codice promozionale applicato',
    vatNote:
      "Il venditore è il fornitore di riferimento. Linketto è una piattaforma intermediaria; il venditore fornisce il contenuto ed è responsabile dell'IVA e dell'eventuale fattura fiscale dovuta.",
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
    discount: 'Código promocional aplicado',
    vatNote:
      'El vendedor es el proveedor responsable. Linketto es una plataforma intermediaria; el vendedor proporciona el contenido y es responsable del IVA y de cualquier factura fiscal que corresponda.',
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
    discount: 'Angewendeter Gutscheincode',
    vatNote:
      'Der Verkäufer ist der leistende Anbieter. Linketto ist eine vermittelnde Plattform; der Verkäufer stellt den Inhalt bereit und ist für die Umsatzsteuer und eine etwaige Steuerrechnung verantwortlich.',
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
    discount: 'Code promo appliqué',
    vatNote:
      "Le vendeur est le fournisseur responsable. Linketto est une plateforme intermédiaire ; le vendeur fournit le contenu et est responsable de la TVA et de toute facture fiscale due.",
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
