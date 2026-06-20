import type { RiskLevel } from "@car-monitor/shared";

const LABELS: Record<RiskLevel, string> = {
  green: "Нисък риск",
  yellow: "Внимание",
  red: "Висок риск",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`badge ${level}`}>{LABELS[level]}</span>;
}

const REASON_LABELS: Record<string, string> = {
  mileage_rollback: "Съмнение за върнат километраж",
  hidden_accident: "Възможна скрита катастрофа",
  cloned_vin: "Възможно клониран VIN",
  price_anomaly: "Аномално ниска цена",
  invalid_vin: "Невалиден VIN",
  salvage_title: "Тотална щета в историята",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}
