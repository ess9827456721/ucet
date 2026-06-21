import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  getOperations, addOperation, updateOperation, deleteOperation, importOperations,
  getCategories, getSubcategories, addCategory, updateCategory, addSubcategory, updateSubcategory,
  getDebts, getDebt, addDebt, updateDebt, deleteDebt, getDebtsWithBalance, getDebtsWithDetails,
  getTranches, addTranche, updateTranche, deleteTranche, updateDebtsOrder,
  getDaysSinceLastPayment, processDadPayment, getDadPaymentHistory, getSimpleDebtPayments, processSimplePayment, getDadForecast, getSimpleForecast,
  deleteDadPayment, updateDadPaymentDate, deleteSimpleDebtPayment, updateSimpleDebtPayment, hasDadPaymentsAfter, hasSimplePaymentsAfter,
  getSummary, getExpensesByCategory, getBigExpensesBreakdown, getDailyExpenses, getExpensesByType, getMonthlyExpenses, getExpensesByDayOfWeek,
  getBudgetSettings, setBudgetSetting, getCashFlow,
  getMandatoryExpensePlan, addMandatoryExpenseItem, updateMandatoryExpenseItem, deleteMandatoryExpenseItem,
  getRecurringOperations, addRecurringOperation, updateRecurringOperation, deleteRecurringOperation, getPendingRecurringOperations, confirmRecurringOperation,
  getSavingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  exportDb, importDb, getDbPath
} from './database'
import ExcelJS from 'exceljs'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ucet.app')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // ── Operations ──────────────────────────────────────
  ipcMain.handle('get-operations', (_, filters) => getOperations(filters))
  ipcMain.handle('add-operation', (_, op) => addOperation(op))
  ipcMain.handle('import-operations', (_, ops) => importOperations(ops))
  ipcMain.handle('update-operation', (_, id, op) => updateOperation(id, op))
  ipcMain.handle('delete-operation', (_, id) => deleteOperation(id))

  // ── Categories ──────────────────────────────────────
  ipcMain.handle('get-categories', (_, type) => getCategories(type))
  ipcMain.handle('get-subcategories', (_, catId) => getSubcategories(catId))
  ipcMain.handle('add-category', (_, cat) => addCategory(cat))
  ipcMain.handle('update-category', (_, id, data) => updateCategory(id, data))
  ipcMain.handle('add-subcategory', (_, sub) => addSubcategory(sub))
  ipcMain.handle('update-subcategory', (_, id, data) => updateSubcategory(id, data))

  // ── Debts ────────────────────────────────────────────
  ipcMain.handle('get-debts', (_, status) => getDebts(status))
  ipcMain.handle('get-debts-with-balance', () => getDebtsWithBalance())
  ipcMain.handle('get-debts-with-details', () => getDebtsWithDetails())
  ipcMain.handle('get-debt', (_, id) => getDebt(id))
  ipcMain.handle('add-debt', (_, debt) => addDebt(debt))
  ipcMain.handle('update-debt', (_, id, data) => updateDebt(id, data))
  ipcMain.handle('delete-debt', (_, id) => deleteDebt(id))
  ipcMain.handle('get-tranches', (_, debtId) => getTranches(debtId))
  ipcMain.handle('add-tranche', (_, tranche) => addTranche(tranche))
  ipcMain.handle('update-tranche', (_, id, data) => updateTranche(id, data))
  ipcMain.handle('delete-tranche', (_, id) => deleteTranche(id))
  ipcMain.handle('update-debts-order', (_, ids) => updateDebtsOrder(ids))
  ipcMain.handle('get-days-since-last-payment', (_, debtId, date) => getDaysSinceLastPayment(debtId, date))
  ipcMain.handle('process-dad-payment', (_, debtId, amount, date) => processDadPayment(debtId, amount, date))
  ipcMain.handle('get-dad-payment-history', (_, debtId) => getDadPaymentHistory(debtId))
  ipcMain.handle('get-simple-debt-payments', (_, debtId) => getSimpleDebtPayments(debtId))
  ipcMain.handle('process-simple-payment', (_, debtId, amount, date, interestPart) => processSimplePayment(debtId, amount, date, interestPart))
  ipcMain.handle('get-dad-forecast', (_, debtId, payment) => getDadForecast(debtId, payment))
  ipcMain.handle('get-simple-forecast', (_, debtId, payment) => getSimpleForecast(debtId, payment))
  ipcMain.handle('delete-dad-payment', (_, paymentId) => deleteDadPayment(paymentId))
  ipcMain.handle('update-dad-payment-date', (_, paymentId, date) => updateDadPaymentDate(paymentId, date))
  ipcMain.handle('delete-simple-debt-payment', (_, paymentId) => deleteSimpleDebtPayment(paymentId))
  ipcMain.handle('update-simple-debt-payment', (_, paymentId, amount, date, interestPart) => updateSimpleDebtPayment(paymentId, amount, date, interestPart))
  ipcMain.handle('has-dad-payments-after', (_, paymentId) => hasDadPaymentsAfter(paymentId))
  ipcMain.handle('has-simple-payments-after', (_, paymentId) => hasSimplePaymentsAfter(paymentId))

  // ── Recurring operations ─────────────────────────────
  ipcMain.handle('get-recurring-operations', (_, activeOnly) => getRecurringOperations(activeOnly))
  ipcMain.handle('add-recurring-operation', (_, r) => addRecurringOperation(r))
  ipcMain.handle('update-recurring-operation', (_, id, data) => updateRecurringOperation(id, data))
  ipcMain.handle('delete-recurring-operation', (_, id) => deleteRecurringOperation(id))
  ipcMain.handle('get-pending-recurring-operations', () => getPendingRecurringOperations())
  ipcMain.handle('confirm-recurring-operation', (_, id, date) => confirmRecurringOperation(id, date))

  // ── Savings goals ────────────────────────────────────
  ipcMain.handle('get-savings-goals', () => getSavingsGoals())
  ipcMain.handle('add-savings-goal', (_, goal) => addSavingsGoal(goal))
  ipcMain.handle('update-savings-goal', (_, id, data) => updateSavingsGoal(id, data))
  ipcMain.handle('delete-savings-goal', (_, id) => deleteSavingsGoal(id))

  // ── Analytics ────────────────────────────────────────
  ipcMain.handle('get-summary', (_, dateFrom, dateTo, expenseType) => getSummary(dateFrom, dateTo, expenseType))
  ipcMain.handle('get-expenses-by-category', (_, dateFrom, dateTo, expenseType) => getExpensesByCategory(dateFrom, dateTo, expenseType))
  ipcMain.handle('get-big-expenses-breakdown', (_, dateFrom, dateTo) => getBigExpensesBreakdown(dateFrom, dateTo))
  ipcMain.handle('get-daily-expenses', (_, dateFrom, dateTo, expenseType) => getDailyExpenses(dateFrom, dateTo, expenseType))
  ipcMain.handle('get-expenses-by-type', (_, dateFrom, dateTo) => getExpensesByType(dateFrom, dateTo))
  ipcMain.handle('get-monthly-expenses', (_, dateFrom, dateTo) => getMonthlyExpenses(dateFrom, dateTo))
  ipcMain.handle('get-expenses-by-day-of-week', (_, dateFrom, dateTo) => getExpensesByDayOfWeek(dateFrom, dateTo))

  // ── Budget ───────────────────────────────────────────
  ipcMain.handle('get-budget-settings', () => getBudgetSettings())
  ipcMain.handle('set-budget-setting', (_, key, value) => setBudgetSetting(key, value))
  ipcMain.handle('get-cash-flow', (_, year, month) => getCashFlow(year, month))
  ipcMain.handle('get-mandatory-expense-plan', (_, year, month) => getMandatoryExpensePlan(year, month))
  ipcMain.handle('add-mandatory-expense-item', (_, year, month, category, amount) => addMandatoryExpenseItem(year, month, category, amount))
  ipcMain.handle('update-mandatory-expense-item', (_, id, data) => updateMandatoryExpenseItem(id, data))
  ipcMain.handle('delete-mandatory-expense-item', (_, id) => deleteMandatoryExpenseItem(id))

  // ── Backup ───────────────────────────────────────────
  ipcMain.handle('export-db', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `ucet-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    })
    if (!result.canceled && result.filePath) {
      exportDb(result.filePath)
      return result.filePath
    }
    return null
  })

  ipcMain.handle('import-db', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (!result.canceled && result.filePaths[0]) {
      importDb(result.filePaths[0])
      return true
    }
    return false
  })

  ipcMain.handle('export-json', async (_, data: unknown) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `ucet-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return result.filePath
    }
    return null
  })

  ipcMain.handle('get-db-path', () => getDbPath())

  ipcMain.handle('open-import-file', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'Таблицы (Excel, CSV)', extensions: ['xlsx', 'xls', 'csv'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const ext = path.extname(filePath).toLowerCase()

    try {
      if (ext === '.csv') {
        const text = fs.readFileSync(filePath, 'utf-8')
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length === 0) return { error: 'Файл пустой' }
        const sep = lines[0].includes(';') ? ';' : ','
        const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')))
        return { headers: rows[0], rows: rows.slice(1) }
      } else {
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.readFile(filePath)
        const ws = wb.worksheets[0]
        if (!ws) return { error: 'Нет листов в файле' }
        const rows: string[][] = []
        ws.eachRow(row => {
          rows.push((row.values as (string | number | null | undefined)[]).slice(1).map(v => v == null ? '' : String(v)))
        })
        if (rows.length === 0) return { error: 'Файл пустой' }
        return { headers: rows[0], rows: rows.slice(1) }
      }
    } catch (e) {
      return { error: String(e) }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
