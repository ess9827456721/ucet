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
    updateTranche: (id: number, data: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>
    deleteTranche: (id: number) => Promise<{ ok: boolean; reason?: string }>
    updateDebtsOrder: (ids: number[]) => Promise<void>
    getDaysSinceLastPayment: (debtId: number, date: string) => Promise<{ days: number; since: string }>
    processDadPayment: (debtId: number, amount: number, date: string) => Promise<unknown>
    getDadPaymentHistory: (debtId: number) => Promise<unknown[]>
    getSimpleDebtPayments: (debtId: number) => Promise<unknown[]>
    processSimplePayment: (debtId: number, amount: number, date: string, interestPart?: number) => Promise<void>
    getDadForecast: (debtId: number, payment: number) => Promise<unknown[]>
    getSimpleForecast: (debtId: number, payment: number) => Promise<unknown[]>
    deleteDadPayment: (paymentId: number) => Promise<void>
    updateDadPayment: (paymentId: number, date: string, amount: number) => Promise<void>
    deleteSimpleDebtPayment: (paymentId: number) => Promise<void>
    updateSimpleDebtPayment: (paymentId: number, amount: number, date: string, interestPart: number) => Promise<void>
    hasDadPaymentsAfter: (paymentId: number) => Promise<boolean>
    hasSimplePaymentsAfter: (paymentId: number) => Promise<boolean>

    getSummary: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown>
    getExpensesByCategory: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown[]>
    getExpensesBySubcategory: (categoryId: number, dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown[]>
    getBigExpensesBreakdown: (dateFrom: string, dateTo: string) => Promise<unknown[]>
    getDailyExpenses: (dateFrom: string, dateTo: string, expenseType?: string) => Promise<unknown[]>
    getExpensesByType: (dateFrom: string, dateTo: string) => Promise<unknown[]>
    getMonthlyExpenses: (dateFrom: string, dateTo: string) => Promise<unknown[]>
    getExpensesByDayOfWeek: (dateFrom: string, dateTo: string) => Promise<unknown[]>

    getRecurringOperations: (activeOnly?: boolean) => Promise<unknown[]>
    addRecurringOperation: (r: Record<string, unknown>) => Promise<number>
    updateRecurringOperation: (id: number, data: Record<string, unknown>) => Promise<void>
    deleteRecurringOperation: (id: number) => Promise<void>
    getPendingRecurringOperations: () => Promise<unknown[]>
    confirmRecurringOperation: (id: number, date: string) => Promise<void>

    getSavingsGoals: () => Promise<unknown[]>
    addSavingsGoal: (goal: Record<string, unknown>) => Promise<number>
    updateSavingsGoal: (id: number, data: Record<string, unknown>) => Promise<void>
    deleteSavingsGoal: (id: number) => Promise<void>

    getBudgetSettings: () => Promise<Record<string, string>>
    setBudgetSetting: (key: string, value: string) => Promise<void>
    getCashFlow: (year: number, month: number) => Promise<unknown>
    getMandatoryExpensePlan: (year: number, month: number) => Promise<unknown[]>
    addMandatoryExpenseItem: (year: number, month: number, category: string, amount: number) => Promise<number>
    updateMandatoryExpenseItem: (id: number, data: Record<string, unknown>) => Promise<void>
    deleteMandatoryExpenseItem: (id: number) => Promise<void>

    openImportFile: () => Promise<{ headers: string[]; rows: string[][] } | { error: string } | null>
    exportDb: () => Promise<string | null>
    importDb: () => Promise<boolean>
    exportJson: (data: unknown) => Promise<string | null>
    getDbPath: () => Promise<string>
  }
}
