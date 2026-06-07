/**
 * Типовете на API договора идват от споделения пакет (`@pomagam/shared`), за да
 * са в синхрон с backend-а. Преекспортираме ги от едно място, така че остатъкът
 * от кода да внася от `@/api/types`.
 */
export type {
  AdminRole,
  ReportStatus,
  MediaKind,
  Admin,
  Ref,
  ReportListItem,
  ReportList,
  ReportMedia,
  ReportEvent,
  ReportDetail,
} from '@pomagam/shared';
