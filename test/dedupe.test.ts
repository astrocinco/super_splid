import { describe, expect, it } from "vitest";
import { findDuplicate } from "../shared/dedupe";
import type { Expense } from "../shared/types";

const exp = (p: Partial<Expense>): Expense => ({
  id: 1, date: "2026-10-10", description: "x", amount_cents: 5000000, category_id: null, payer_id: 1,
  created_by: 1, splits: [], invoice_provider: "iplan", invoice_number: null, ...p,
});
const TODAY = "2026-11-13";

describe("findDuplicate con facturas pendientes (correo)", () => {
  it("compara también contra filas que no son gastos", () => {
    const pend = [{ id: 7, invoice_provider: "aysa", invoice_number: "0111B00000002", amount_cents: 3000050, date: "2026-10-20" }];
    const r = findDuplicate({ provider: "aysa", invoice_number: "0111B00000002", total_cents: 3000050, date: "2026-10-10" }, pend, TODAY);
    expect(r).toMatchObject({ level: "exact", expense: { id: 7 } });
  });
});

describe("findDuplicate", () => {
  it("mismo número de factura = duplicado exacto, sin importar la antigüedad", () => {
    const old = exp({ date: "2025-01-01", invoice_number: "00005-1" });
    expect(findDuplicate({ provider: "iplan", invoice_number: "00005-1", total_cents: 1, date: TODAY }, [old], TODAY))
      .toMatchObject({ level: "exact" });
  });
  it("PDF cargado primero, el correo llega después (sin número): probable", () => {
    const pdf = exp({ date: "2026-10-10", invoice_number: "00005-1" });
    expect(findDuplicate({ provider: "iplan", invoice_number: null, total_cents: 5000000, date: "2026-10-11" }, [pdf], TODAY))
      .toMatchObject({ level: "likely" });
  });
  it("mismo monto un mes después NO es duplicado (abono fijo de internet)", () => {
    const sep = exp({ date: "2026-09-10" });
    expect(findDuplicate({ provider: "iplan", invoice_number: null, total_cents: 5000000, date: "2026-10-11" }, [sep], TODAY)).toBeNull();
  });
  it("números distintos = facturas distintas aunque coincidan monto y fecha", () => {
    const a = exp({ invoice_number: "A" });
    expect(findDuplicate({ provider: "iplan", invoice_number: "B", total_cents: 5000000, date: "2026-10-10" }, [a], TODAY)).toBeNull();
  });
  it("distinto proveedor nunca coincide", () => {
    expect(findDuplicate({ provider: "aysa", invoice_number: null, total_cents: 5000000, date: "2026-10-10" }, [exp({})], TODAY)).toBeNull();
  });
  it("fuera de la ventana de 4 meses no avisa por coincidencia aproximada", () => {
    const old = exp({ date: "2026-05-01" });
    expect(findDuplicate({ provider: "iplan", invoice_number: null, total_cents: 5000000, date: "2026-05-02" }, [old], TODAY)).toBeNull();
  });
  it("MetroGAS: dos liquidaciones del bimestre con distinto monto y fecha no chocan", () => {
    const first = exp({ invoice_provider: "metrogas", date: "2026-10-13", amount_cents: 1200000 });
    expect(findDuplicate({ provider: "metrogas", invoice_number: "500000000002", total_cents: 1100000, date: "2026-11-10" }, [first], TODAY)).toBeNull();
  });
});
