"use strict";
const electron = require("electron");
const api = {
  // Operations
  getOperations: (filters) => electron.ipcRenderer.invoke("get-operations", filters),
  addOperation: (op) => electron.ipcRenderer.invoke("add-operation", op),
  importOperations: (ops) => electron.ipcRenderer.invoke("import-operations", ops),
  updateOperation: (id, op) => electron.ipcRenderer.invoke("update-operation", id, op),
  deleteOperation: (id) => electron.ipcRenderer.invoke("delete-operation", id),
  // Categories
  getCategories: (type) => electron.ipcRenderer.invoke("get-categories", type),
  getSubcategories: (catId) => electron.ipcRenderer.invoke("get-subcategories", catId),
  addCategory: (cat) => electron.ipcRenderer.invoke("add-category", cat),
  updateCategory: (id, data) => electron.ipcRenderer.invoke("update-category", id, data),
  addSubcategory: (sub) => electron.ipcRenderer.invoke("add-subcategory", sub),
  updateSubcategory: (id, data) => electron.ipcRenderer.invoke("update-subcategory", id, data),
  // Debts
  getDebts: (status) => electron.ipcRenderer.invoke("get-debts", status),
  getDebt: (id) => electron.ipcRenderer.invoke("get-debt", id),
  addDebt: (debt) => electron.ipcRenderer.invoke("add-debt", debt),
  updateDebt: (id, data) => electron.ipcRenderer.invoke("update-debt", id, data),
  deleteDebt: (id) => electron.ipcRenderer.invoke("delete-debt", id),
  getTranches: (debtId) => electron.ipcRenderer.invoke("get-tranches", debtId),
  addTranche: (tranche) => electron.ipcRenderer.invoke("add-tranche", tranche),
  processDadPayment: (debtId, amount, date, days) => electron.ipcRenderer.invoke("process-dad-payment", debtId, amount, date, days),
  getDadPaymentHistory: (debtId) => electron.ipcRenderer.invoke("get-dad-payment-history", debtId),
  getSimpleDebtPayments: (debtId) => electron.ipcRenderer.invoke("get-simple-debt-payments", debtId),
  processSimplePayment: (debtId, amount, date, interestPart) => electron.ipcRenderer.invoke("process-simple-payment", debtId, amount, date, interestPart),
  getDadForecast: (debtId, payment) => electron.ipcRenderer.invoke("get-dad-forecast", debtId, payment),
  getSimpleForecast: (debtId, payment) => electron.ipcRenderer.invoke("get-simple-forecast", debtId, payment),
  // Analytics
  getSummary: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-summary", dateFrom, dateTo),
  getExpensesByCategory: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-expenses-by-category", dateFrom, dateTo),
  getDailyExpenses: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-daily-expenses", dateFrom, dateTo),
  getExpensesByType: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-expenses-by-type", dateFrom, dateTo),
  getMonthlyExpenses: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-monthly-expenses", dateFrom, dateTo),
  getExpensesByDayOfWeek: (dateFrom, dateTo) => electron.ipcRenderer.invoke("get-expenses-by-day-of-week", dateFrom, dateTo),
  // Budget / Cash flow
  getBudgetSettings: () => electron.ipcRenderer.invoke("get-budget-settings"),
  setBudgetSetting: (key, value) => electron.ipcRenderer.invoke("set-budget-setting", key, value),
  getCashFlow: (year, month) => electron.ipcRenderer.invoke("get-cash-flow", year, month),
  // Backup
  openImportFile: () => electron.ipcRenderer.invoke("open-import-file"),
  exportDb: () => electron.ipcRenderer.invoke("export-db"),
  importDb: () => electron.ipcRenderer.invoke("import-db"),
  exportJson: (data) => electron.ipcRenderer.invoke("export-json", data),
  getDbPath: () => electron.ipcRenderer.invoke("get-db-path")
};
electron.contextBridge.exposeInMainWorld("api", api);
