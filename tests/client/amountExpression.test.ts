import { describe, expect, it } from "vitest";
import { parseAmountExpression } from "../../src/features/forms/amountExpression";

describe("parseAmountExpression", () => {
  it("evaluates yen amount expressions with operator precedence, parentheses, commas, and an optional leading equals sign", () => {
    expect(parseAmountExpression("1000+2000", "金額")).toBe(3000);
    expect(parseAmountExpression("=(1,200 + 300) * 2", "金額")).toBe(3000);
    expect(parseAmountExpression("10,000/4", "金額")).toBe(2500);
  });

  it("rejects blank, fractional, unsafe, and malformed amount expressions", () => {
    expect(() => parseAmountExpression("", "金額")).toThrow("金額を入力してください。");
    expect(() => parseAmountExpression("1000/3", "金額")).toThrow("金額は整数になる式で入力してください。");
    expect(() => parseAmountExpression("1/0", "金額")).toThrow("金額は有効な数式で入力してください。");
    expect(() => parseAmountExpression("9007199254740992", "金額")).toThrow(
      "金額は9,007,199,254,740,991以下で入力してください。",
    );
    expect(() => parseAmountExpression("1000+", "金額")).toThrow("金額は有効な数式で入力してください。");
    expect(() => parseAmountExpression("SUM(1000,2000)", "金額")).toThrow(
      "金額は有効な数式で入力してください。",
    );
  });
});
