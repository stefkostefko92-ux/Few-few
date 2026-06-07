/**
 * Схемата за подаване на сигнал живее в споделения пакет (`@pomagam/shared`),
 * за да е единен договорът между приложенията. Тук само я преекспортираме под
 * имената, които ползва рутерът.
 */
export {
  reportSubmitSchema as createReportSchema,
  type ReportSubmitInput as CreateReportInput,
} from '@pomagam/shared';
