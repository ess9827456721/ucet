// Typed wrapper around the window.api bridge exposed by preload via contextBridge
export function useApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).api as {
    getOperations: (filters: Record<string, unknown>) => Promise<unknown[]>
    addOperation: (op: Record<string, unknown>) => Promise<number>
    updateOperation: (id: number, op: Record<string, unknown>) => Promise<void>
    deleteOperation: (id: number) => Promise<void>
    importOperations: (ops: Record<string, unknown>[]) => Promise<number>

    getCategories: (type?: string) => Promise<unknown[]>
    getSubcategories: (catId?: number) => Promise<unknown[]>
    addCategory: (cat: Record<string, unknown>) => Promise<number>
    updateCategory: (id: number, data: Record<string, unknown>) => Promise<void>
    addSubcategory: (sub: Record<string, unknown>) => Promise<number>
    updateSubcategory: (id: number, data: Record<string, unknown>) => Promise<void>

    getDebts: (status?: string) => Promise<unknown[]>
    getDebtsWithBalance: () => Promise<unknown[]>
    getDebtsWithDetails: () => Promise<unknown[]>
    getDebt: (id: number) => Promise<unknown>
    addDebt: (debt: Record<string, unknown>) => Promise<number>
    updateDebt: (id: number, data: Record<string, unknown>) => Promise<void>
    deleteDebt: (id: number) => Promise<void>
    getTranches: (debtId: number) => Promise<unknown[]>
    addTranche: (tranche: Record<string, unknown>) => Promise<number>
    processDadPayment: (debtId: number, amount: number, date: string, days: number) => Promise<unknown>
    getDadPaymentHistory: (debtId: number) => Promise<unknown[]>
    getSimpleDebtPayments: (debtId: number) => Promise<unknown[]>
    processSimplePayment: (debtId: number, amount: number, date: string, interestPart?: number) => Promise<void>
    getDadForecast: (debtId: number, payment: number) => Promise<unknown[]>
    getSimpleForecast: (debtId: number, payment: number) => Promise<unknown[]>

    getSummary: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown>
    getExpensesByCategory: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown[]>
    getDailyExpenses: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown[]>
    getExpensesByType: (dateFrom: string, dateTo: string) => Promise<unknown[]>
    getMonthlyExpenses: (dateFrom: string, dateTo: string) => Promise<unknown[]>
    getExpensesByDayOfWeek: (dateFrom: string, dateTo: string) => Promise<unknown[]>

    getBudgetSettings: () => Promise<Record<string, string>>
    setBudgetSetting: (key: string, value: string) => Promise<void>
    getCashFlow: (year: number, month: number) => Promise<unknown>

    openImportFile: () => Promise<{ headers: string[]; rows: string[][] } | { error: string } | null>
    exportDb: () => Promise<string | null>
    importDb: () => Promise<boolean>
    exportJson: (data: unknown) => Promise<string | null>
    getDbPath: () => Promise<string>
  }
}
