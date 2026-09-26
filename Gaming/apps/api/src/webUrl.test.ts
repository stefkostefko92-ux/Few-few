import { describe, expect, it } from "vitest";
import { buildWebUrl } from "./webUrl.js";

describe("buildWebUrl — един базов път, без /app/app", () => {
  it("origin + WEB_BASE_PATH (каноничната конвенция)", () => {
    expect(buildWebUrl("https://gaming.carbonstealth.eu", "/app", "/shop?status=success")).toBe(
      "https://gaming.carbonstealth.eu/app/shop?status=success",
    );
  });

  it("стар .env: PUBLIC_WEB_URL вече завършва на /app → не се дублира", () => {
    expect(buildWebUrl("https://gaming.carbonstealth.eu/app", "/app", "/verify-email?token=x")).toBe(
      "https://gaming.carbonstealth.eu/app/verify-email?token=x",
    );
  });

  it("без базов път (dev)", () => {
    expect(buildWebUrl("http://localhost:4502", "", "/shop")).toBe("http://localhost:4502/shop");
  });

  it("нормализира наклонените черти", () => {
    expect(buildWebUrl("https://x.eu/app/", "app/", "shop")).toBe("https://x.eu/app/shop");
    expect(buildWebUrl("https://x.eu/", "/app/", "/shop")).toBe("https://x.eu/app/shop");
  });

  it("не бърка /app с път, който само съдържа „app“", () => {
    expect(buildWebUrl("https://x.eu/myapp", "/app", "/shop")).toBe("https://x.eu/myapp/app/shop");
  });
});
