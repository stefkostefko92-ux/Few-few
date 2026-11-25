import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api";
import { checkoutErrorKey } from "./shopErrors";

describe("checkoutErrorKey", () => {
  it("already_subscribed има собствен текст (не общото „Грешка“)", () => {
    expect(checkoutErrorKey(new ApiError(409, "already_subscribed", "x"))).toBe("shop.sub.alreadySubscribed");
  });
  it("изтрит/деактивиран продукт → „не се предлага“", () => {
    expect(checkoutErrorKey(new ApiError(409, "product_unavailable", "x"))).toBe("shop.productUnavailable");
    expect(checkoutErrorKey(new ApiError(404, "unknown_sku", "x"))).toBe("shop.productUnavailable");
  });
  it("Stripe изключен и непознати грешки", () => {
    expect(checkoutErrorKey(new ApiError(503, "stripe_unavailable", "x"))).toBe("shop.unavailable");
    expect(checkoutErrorKey(new ApiError(500, "internal", "x"))).toBe("shop.error");
    expect(checkoutErrorKey(new Error("net"))).toBe("shop.error");
  });
});
