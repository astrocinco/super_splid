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
export interface AppData {
  users: User[]; categories: Category[]; expenses: Expense[]; settlements: Settlement[];
}
