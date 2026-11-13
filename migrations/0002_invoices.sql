-- Origen de un gasto cuando viene de una factura de servicios.
-- (invoice_provider, invoice_number) es único: la misma factura no se puede cargar dos veces.
ALTER TABLE expenses ADD COLUMN invoice_provider TEXT;
ALTER TABLE expenses ADD COLUMN invoice_number TEXT;
CREATE UNIQUE INDEX idx_expenses_invoice ON expenses(invoice_provider, invoice_number) WHERE invoice_number IS NOT NULL;
