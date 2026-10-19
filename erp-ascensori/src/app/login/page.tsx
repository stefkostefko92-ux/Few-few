// Вход. Сървърна обвивка: демо режимът (`DEMO=1`) се чете ПРИ ЗАЯВКАТА от
// средата на сървъра — `NEXT_PUBLIC_…` би се запекъл в билда на образа и
// демото не би се изключвало без нов билд.

import FormAccesso from "./FormAccesso";
import { ACCOUNT_DEMO, PASSWORD_DEMO, demoAttiva } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default function PaginaAccesso() {
  return (
    <FormAccesso
      demo={
        demoAttiva()
          ? { password: PASSWORD_DEMO, account: [...ACCOUNT_DEMO] }
          : null
      }
    />
  );
}
