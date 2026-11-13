export interface User { id: number; email: string; name: string; picture: string | null }
export interface Category { id: number; name: string; emoji: string }
export interface Split { user_id: number; owed_cents: number }
export interface Expense {
  id: number; date: string; description: string; amount_cents: number;
  category_id: number | null; payer_id: number; created_by: number; splits: Split[];
  invoice_provider?: string | null; invoice_number?: string | null;
}
export interface Settlement {
  id: number; date: string; from_user: number; to_user: number;
  amount_cents: number; note: string | null; created_by: number;
}
export interface PendingInvoice {
  id: number; provider: string; provider_name: string; kind_name: string; total_cents: number;
  invoice_number: string | null; issue_date: string; due_date: string | null;
}
export interface AppData {
  users: User[]; categories: Category[]; expenses: Expense[]; settlements: Settlement[]; pending: PendingInvoice[];
}
