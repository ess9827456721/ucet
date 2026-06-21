export interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
  archived: number
}

export interface Subcategory {
  id: number
  category_id: number
  name: string
  archived: number
}

export interface Operation {
  id: number
  date: string
  type: 'income' | 'expense' | 'transfer' | 'debt_op'
  amount: number
  category_id: number | null
  subcategory_id: number | null
  expense_type: 'daily' | 'big' | 'apartment' | null
  account_id: number | null
  comment: string | null
  debt_id: number | null
  created_at: string
  category_name?: string
  category_color?: string
  subcategory_name?: string
}

export interface Debt {
  id: number
  name: string
  direction: 'i_owe' | 'owe_me'
  debt_type: 'dad' | 'simple'
  status: 'active' | 'closed'
  initial_amount: number | null
  interest_rate: number | null
  payment_day: number | null
  monthly_payment: number | null
  overdue_interest_pool: number
  created_at: string
  category: string | null
  sort_order: number | null
  is_hidden: number
  loan_date?: string | null
  current_balance?: number
  accrued_interest?: number
  last_payment_date?: string | null
  is_overdue?: boolean
}

export interface Tranche {
  id: number
  debt_id: number
  date: string
  initial_amount: number
  current_balance: number
  interest_rate: number
  status: 'active' | 'paid'
  created_at: string
}

export interface MandatoryExpenseItem {
  id: number | null
  category: string
  plannedAmount: number
  actualAmount: number | null
  isDebtLinked: boolean
  debtId: number | null
}

export interface DadPayment {
  id: number
  debt_id: number
  payment_date: string
  total_amount: number
  interest_covered: number
  pool_covered: number
  body_covered: number
  overdue_added_to_pool: number
  trancheBreakdown: Array<{
    tranche_id: number
    amount_applied: number
    interest_rate: number
    tranche_date: string
  }>
}

export interface SimpleDebtPayment {
  id: number
  debt_id: number
  payment_date: string
  total_amount: number
  interest_part: number
  body_part: number
}

export interface Summary {
  income: number
  expense: number
  debtOps: number
  balance: number
  avgPerDay: number
  avgPerDayWithDebt: number
}

export interface CashFlowData {
  income: number
  mandatory: number
  dailyBudget: number
  dateFrom: string
  dateTo: string
  journal: Array<{
    date: string
    dayExpenses: number
    cumLimit: number
    saldo: number
  }>
  mandatoryItems: MandatoryExpenseItem[]
}

export interface RecurringOperation {
  id: number
  type: 'income' | 'expense' | 'transfer'
  amount: number
  category_id: number | null
  subcategory_id: number | null
  expense_type: 'daily' | 'big' | 'apartment' | null
  day_of_month: number
  comment: string | null
  active: number
  last_created: string | null
  category_name?: string
  category_color?: string
}

export interface SavingsGoal {
  id: number
  name: string
  target_amount: number
  current_amount: number
  color: string
  target_date: string | null
  status: 'active' | 'completed'
  created_at: string
}

export type Page = 'dashboard' | 'operations' | 'cashflow' | 'debts' | 'debt-detail' | 'debt-forecast' | 'debt-analytics' | 'settings'
