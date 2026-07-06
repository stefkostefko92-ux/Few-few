// BORICA „ПОС-ECR“ интеграция — адаптер-заготовка.
// БОРИКА предоставя техническата спецификация за интеграция каса↔терминал
// само след подписано Споразумение за конфиденциалност (NDA) до office@borica.bg:
// https://www.borica.bg/products-and-services/integratsiya-na-pos-ustroystva-sas-sistema-za-prodajbi
// След получаване на спецификацията се попълват методите по-долу
// (транспортът е сериен или TCP/IP според модела терминал — Verifone и др.).

import type { TerminalDriver, TerminalResult, TerminalStatus } from "./types";

export class BoricaTerminalDriver implements TerminalDriver {
  readonly id = "borica";
  readonly label = "BORICA банков терминал (изисква NDA спецификация)";

  async status(): Promise<TerminalStatus> {
    return {
      ok: false,
      driver: this.id,
      detail:
        "Адаптерът очаква имплементация по „ПОС-ECR техническа спецификация“ на БОРИКА (получава се след NDA).",
    };
  }

  async purchase(): Promise<TerminalResult> {
    return {
      ok: false,
      error:
        "BORICA интеграцията изисква спецификация под NDA. Междувременно: маркирайте плащането на терминала ръчно и потвърдете тук.",
    };
  }

  async refund(): Promise<TerminalResult> {
    return { ok: false, error: "BORICA интеграцията изисква спецификация под NDA." };
  }
}
