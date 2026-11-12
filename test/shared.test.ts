import { describe, expect, it } from "vitest";
import { computeBalances, pairwiseDebt } from "../shared/balance";
import { formatARS, parseAmount, splitTwoWays } from "../shared/money";
import type { Expense } from "../shared/types";

const exp = (id: number, payer: number, amount: number, other: number, pct: number): Expense => ({
  id, date: "2026-01-01", description: "x", amount_cents: amount, category_id: null,
  payer_id: payer, created_by: payer, splits: splitTwoWays(amount, payer, other, pct),
});

describe("splitTwoWays", () => {
  it("50/50 suma el total", () => {
    const s = splitTwoWays(10001, 1, 2, 50);
    expect(s.reduce((a, x) => a + x.owed_cents, 0)).toBe(10001);
  });
  it("100% del otro = préstamo", () => {
    expect(splitTwoWays(5000, 1, 2, 100)).toEqual([
      { user_id: 1, owed_cents: 0 }, { user_id: 2, owed_cents: 5000 },
    ]);
  });
});

describe("balances", () => {
  it("50/50: quien paga es acreedor por la mitad", () => {
    const net = computeBalances([exp(1, 1, 10000, 2, 50)], []);
    expect(pairwiseDebt(net, 1, 2)).toEqual({ debtor: 2, creditor: 1, cents: 5000 });
  });
  it("gastos cruzados se compensan", () => {
    const net = computeBalances([exp(1, 1, 10000, 2, 50), exp(2, 2, 6000, 1, 50)], []);
    expect(pairwiseDebt(net, 1, 2)).toEqual({ debtor: 2, creditor: 1, cents: 2000 });
  });
  it("una devolución deja el saldo en cero", () => {
    const net = computeBalances([exp(1, 1, 10000, 2, 50)], [
      { id: 1, date: "2026-01-02", from_user: 2, to_user: 1, amount_cents: 5000, note: null, created_by: 2 },
    ]);
    expect(pairwiseDebt(net, 1, 2)).toBeNull();
  });
});

describe("parseAmount", () => {
  it.each([["1234,56", 123456], ["1.234,56", 123456], ["1234.56", 123456], ["1.500", 150000], ["$ 800", 80000]])(
    "%s", (i, o) => expect(parseAmount(i as string)).toBe(o));
  it("rechaza basura", () => expect(parseAmount("abc")).toBeNull());
  it("formatea ARS", () => expect(formatARS(123456)).toContain("1.234,56"));
});
