import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const api = {
  // Operations
  getOperations: (filters: Record<string, unknown>) => ipcRenderer.invoke('get-operations', filters),
  addOperation: (op: Record<string, unknown>) => ipcRenderer.invoke('add-operation', op),
  importOperations: (ops: Record<string, unknown>[], options?: { skipDuplicates?: boolean }) => ipcRenderer.invoke('import-operations', ops, options),
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
  updateTranche: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-tranche', id, data),
  deleteTranche: (id: number) => ipcRenderer.invoke('delete-tranche', id),
  updateDebtsOrder: (ids: number[]) => ipcRenderer.invoke('update-debts-order', ids),
  getDaysSinceLastPayment: (debtId: number, date: string) => ipcRenderer.invoke('get-days-since-last-payment', debtId, date),
  processDadPayment: (debtId: number, amount: number, date: string) =>
    ipcRenderer.invoke('process-dad-payment', debtId, amount, date),
  getDadPaymentHistory: (debtId: number) => ipcRenderer.invoke('get-dad-payment-history', debtId),
  getSimpleDebtPayments: (debtId: number) => ipcRenderer.invoke('get-simple-debt-payments', debtId),
  processSimplePayment: (debtId: number, amount: number, date: string, interestPart?: number, paymentType?: string) =>
    ipcRenderer.invoke('process-simple-payment', debtId, amount, date, interestPart, paymentType),
  getDadForecast: (debtId: number, payment: number) => ipcRenderer.invoke('get-dad-forecast', debtId, payment),
  getSimpleForecast: (debtId: number, payment: number) => ipcRenderer.invoke('get-simple-forecast', debtId, payment),
  markDadPaymentSufficient: (paymentId: number) => ipcRenderer.invoke('mark-dad-payment-sufficient', paymentId),
  deleteDadPayment: (paymentId: number) => ipcRenderer.invoke('delete-dad-payment', paymentId),
  updateDadPayment: (paymentId: number, date: string, amount: number) => ipcRenderer.invoke('update-dad-payment', paymentId, date, amount),
  deleteSimpleDebtPayment: (paymentId: number) => ipcRenderer.invoke('delete-simple-debt-payment', paymentId),
  updateSimpleDebtPayment: (paymentId: number, amount: number, date: string, interestPart: number) => ipcRenderer.invoke('update-simple-debt-payment', paymentId, amount, date, interestPart),
  hasDadPaymentsAfter: (paymentId: number) => ipcRenderer.invoke('has-dad-payments-after', paymentId),
  hasSimplePaymentsAfter: (paymentId: number) => ipcRenderer.invoke('has-simple-payments-after', paymentId),
  getEarlyPaymentCandidates: () => ipcRenderer.invoke('get-early-payment-candidates'),
  markPaymentsEarly: (ids: number[]) => ipcRenderer.invoke('mark-payments-early', ids),

  // Analytics
  getSummary: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-summary', dateFrom, dateTo, expenseType),
  getExpensesByCategory: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-expenses-by-category', dateFrom, dateTo, expenseType),
  getExpensesBySubcategory: (categoryId: number, dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-expenses-by-subcategory', categoryId, dateFrom, dateTo, expenseType),
  getBigExpensesBreakdown: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-big-expenses-breakdown', dateFrom, dateTo),
  getDailyExpenses: (dateFrom: string, dateTo: string, expenseType?: string) => ipcRenderer.invoke('get-daily-expenses', dateFrom, dateTo, expenseType),
  getExpensesByType: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-expenses-by-type', dateFrom, dateTo),
  getMonthlyExpenses: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-monthly-expenses', dateFrom, dateTo),
  getExpensesByDayOfWeek: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('get-expenses-by-day-of-week', dateFrom, dateTo),

  // Recurring operations
  getRecurringOperations: (activeOnly?: boolean) => ipcRenderer.invoke('get-recurring-operations', activeOnly),
  addRecurringOperation: (r: Record<string, unknown>) => ipcRenderer.invoke('add-recurring-operation', r),
  updateRecurringOperation: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-recurring-operation', id, data),
  deleteRecurringOperation: (id: number) => ipcRenderer.invoke('delete-recurring-operation', id),
  getPendingRecurringOperations: () => ipcRenderer.invoke('get-pending-recurring-operations'),
  confirmRecurringOperation: (id: number, date: string) => ipcRenderer.invoke('confirm-recurring-operation', id, date),

  // Savings accounts
  getSavingsAccounts: () => ipcRenderer.invoke('get-savings-accounts'),
  getSavingsAccount: (id: number) => ipcRenderer.invoke('get-savings-account', id),
  addSavingsAccount: (data: Record<string, unknown>) => ipcRenderer.invoke('add-savings-account', data),
  updateSavingsAccount: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-savings-account', id, data),
  deleteSavingsAccount: (id: number) => ipcRenderer.invoke('delete-savings-account', id),
  getSavingsTransactions: (accountId: number) => ipcRenderer.invoke('get-savings-transactions', accountId),
  addSavingsDeposit: (accountId: number, amount: number, date: string, comment?: string) => ipcRenderer.invoke('add-savings-deposit', accountId, amount, date, comment),
  addSavingsWithdrawal: (accountId: number, amount: number, date: string, comment?: string) => ipcRenderer.invoke('add-savings-withdrawal', accountId, amount, date, comment),
  applyAccruedInterest: (accountId: number) => ipcRenderer.invoke('apply-accrued-interest', accountId),
  getPendingSavingsInterest: () => ipcRenderer.invoke('get-pending-savings-interest'),
  getSavingsForecast: (accountId: number, monthlyContribution: number, months: number) => ipcRenderer.invoke('get-savings-forecast', accountId, monthlyContribution, months),
  updateSavingsAccountsOrder: (ids: number[]) => ipcRenderer.invoke('update-savings-accounts-order', ids),
  getAccountsForAutoContribute: () => ipcRenderer.invoke('get-accounts-for-auto-contribute'),

  // Budget / Cash flow
  getBudgetSettings: () => ipcRenderer.invoke('get-budget-settings'),
  setBudgetSetting: (key: string, value: string) => ipcRenderer.invoke('set-budget-setting', key, value),
  getCashFlow: (year: number, month: number) => ipcRenderer.invoke('get-cash-flow', year, month),
  getMandatoryExpensePlan: (year: number, month: number) => ipcRenderer.invoke('get-mandatory-expense-plan', year, month),
  addMandatoryExpenseItem: (year: number, month: number, category: string, amount: number) => ipcRenderer.invoke('add-mandatory-expense-item', year, month, category, amount),
  updateMandatoryExpenseItem: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('update-mandatory-expense-item', id, data),
  deleteMandatoryExpenseItem: (id: number) => ipcRenderer.invoke('delete-mandatory-expense-item', id),

  // Backup
  openImportFile: () => ipcRenderer.invoke('open-import-file'),
  exportDb: () => ipcRenderer.invoke('export-db'),
  importDb: () => ipcRenderer.invoke('import-db'),
  exportJson: (data: unknown) => ipcRenderer.invoke('export-json', data),
  getDbPath: () => ipcRenderer.invoke('get-db-path'),

  // Updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  updaterVersion: () => ipcRenderer.invoke('updater:version'),
  onUpdaterStatus: (cb: (payload: Record<string, unknown>) => void) => {
    const listener = (_: IpcRendererEvent, payload: Record<string, unknown>): void => cb(payload)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
