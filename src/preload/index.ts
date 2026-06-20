import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Operations
  getOperations: (filters: Record<string, unknown>) => ipcRenderer.invoke('get-operations', filters),
  addOperation: (op: Record<string, unknown>) => ipcRenderer.invoke('add-operation', op),
  importOperations: (ops: Record<string, unknown>[]) => ipcRenderer.invoke('import-operations', ops),
  updateOperation: (id: number, op: Record<string, unknown>) => ipcRenderer.invoke('update-operation', id, op),
  deleteOperation: (id: number) => ipcRenderer.invoke('delete-operation', id),

  // Categories
  getCategories: (type?: string) => ipcRenderer.invoke('get-categories', type),
  getSubcategories: (catId?: number) => ipcRenderer.invoke('get-subcategories', catId),
  addCategory: (cat: Record<string, unknown>) => ipcRenderer.invoke('add-category', cat),
  updateCategory: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-category', id, data),
  addSubcategory: (sub: Record<string, unknown>) => ipcRenderer.invoke('add-subcategory', sub),
  updateSubcategory: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-subcategory', id, data),

  // Debts
  getDebts: (status?: string) => ipcRenderer.invoke('get-debts', status),
  getDebtsWithBalance: () => ipcRenderer.invoke('get-debts-with-balance'),
  getDebtsWithDetails: () => ipcRenderer.invoke('get-debts-with-details'),
  getDebt: (id: number) => ipcRenderer.invoke('get-debt', id),
  addDebt: (debt: Record<string, unknown>) => ipcRenderer.invoke('add-debt', debt),
  updateDebt: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-debt', id, data),
  deleteDebt: (id: number) => ipcRenderer.invoke('delete-debt', id),
  getTranches: (debtId: number) => ipcRenderer.invoke('get-tranches', debtId),
  addTranche: (tranche: Record<string, unknown>) => ipcRenderer.invoke('add-tranche', tranche),
  processDadPayment: (debtId: number, amount: number, date: string, days: number) =>
    ipcRenderer.invoke('process-dad-payment', debtId, amount, date, days),
  getDadPaymentHistory: (debtId: number) => ipcRenderer.invoke('get-dad-payment-history', debtId),
  getSimpleDebtPayments: (debtId: number) => ipcRenderer.invoke('get-simple-debt-payments', debtId),
  processSimplePayment: (debtId: number, amount: number, date: string, interestPart?: number) =>
    ipcRenderer.invoke('process-simple-payment', debtId, amount, date, interestPart),
  getDadForecast: (debtId: number, payment: number) => ipcRenderer.invoke('get-dad-forecast', debtId, payment),
  getSimpleForecast: (debtId: number, payment: number) => ipcRenderer.invoke('get-simple-forecast', debtId, payment),
  deleteDadPayment: (paymentId: number) => ipcRenderer.invoke('delete-dad-payment', paymentId),
  updateDadPaymentDate: (paymentId: number, date: string) => ipcRenderer.invoke('update-dad-payment-date', paymentId, date),
  deleteSimpleDebtPayment: (paymentId: number) => ipcRenderer.invoke('delete-simple-debt-payment', paymentId),
  updateSimpleDebtPayment: (paymentId: number, amount: number, date: string, interestPart: number) => ipcRenderer.invoke('update-simple-debt-payment', paymentId, amount, date, interestPart),
  hasDadPaymentsAfter: (paymentId: number) => ipcRenderer.invoke('has-dad-payments-after', paymentId),
  hasSimplePaymentsAfter: (paymentId: number) => ipcRenderer.invoke('has-simple-payments-after', paymentId),

  // Analytics
  getSummary: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-summary', dateFrom, dateTo, expenseType),
  getExpensesByCategory: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-expenses-by-category', dateFrom, dateTo, expenseType),
  getDailyExpenses: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-daily-expenses', dateFrom, dateTo, expenseType),
  getExpensesByType: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-expenses-by-type', dateFrom, dateTo),
  getMonthlyExpenses: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-monthly-expenses', dateFrom, dateTo),
  getExpensesByDayOfWeek: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-expenses-by-day-of-week', dateFrom, dateTo),

  // Budget / Cash flow
  getBudgetSettings: () => ipcRenderer.invoke('get-budget-settings'),
  setBudgetSetting: (key: string, value: string) => ipcRenderer.invoke('set-budget-setting', key, value),
  getCashFlow: (year: number, month: number) => ipcRenderer.invoke('get-cash-flow', year, month),

  // Backup
  openImportFile: () => ipcRenderer.invoke('open-import-file'),
  exportDb: () => ipcRenderer.invoke('export-db'),
  importDb: () => ipcRenderer.invoke('import-db'),
  exportJson: (data: unknown) => ipcRenderer.invoke('export-json', data),
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
