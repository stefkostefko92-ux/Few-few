/** Един прикачен медиен файл — локален път на телефона, не URL. */
export type MediaAsset = {
  uri: string;
  kind: 'image' | 'video';
  mimeType: string;
  fileName: string;
};

/** Координати от GPS, ако са налични. */
export type GeoPoint = {
  lat: number;
  lng: number;
};

/** Чернова на сигнал, докато гражданинът минава през стъпките. */
export type ReportDraft = {
  categorySlug: string | null;
  settlementSlug: string | null;
  media: MediaAsset[];
  location: GeoPoint | null;
  description: string;
  reporterName: string;
  reporterPhone: string;
};

/** Запазен в опашката сигнал, който чака качване. */
export type QueuedReport = {
  id: string;
  createdAt: number;
  categorySlug: string;
  settlementSlug: string;
  media: MediaAsset[];
  location: GeoPoint | null;
  description: string;
  reporterName: string;
  reporterPhone: string;
  attempts: number;
};

/** Отговор от API при успешно подаване. */
export type SubmitResult = {
  publicCode: string;
};

/** Публична справка за състоянието на сигнал по неговия номер. */
export type ReportStatusResult = {
  publicCode: string;
  status: string;
  statusLabel: string;
  category: { slug: string; nameBg: string };
  settlement: { slug: string; nameBg: string };
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
};

export function emptyDraft(): ReportDraft {
  return {
    categorySlug: null,
    settlementSlug: null,
    media: [],
    location: null,
    description: '',
    reporterName: '',
    reporterPhone: '',
  };
}
