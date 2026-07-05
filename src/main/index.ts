import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  getOperations, addOperation, updateOperation, deleteOperation, importOperations,
  getCategories, getSubcategories, addCategory, updateCategory, addSubcategory, updateSubcategory,
  getDebts, getDebt, addDebt, updateDebt, deleteDebt, getDebtsWithBalance, getDebtsWithDetails,
  getTranches, addTranche, updateTranche, deleteTranche, updateDebtsOrder,
  getDaysSinceLastPayment, processDadPayment, getDadPaymentHistory, markDadPaymentSufficient, getSimpleDebtPayments, processSimplePayment, getDadForecast, getSimpleForecast,
  deleteDadPayment, updateDadPayment, deleteSimpleDebtPayment, updateSimpleDebtPayment, hasDadPaymentsAfter, hasSimplePaymentsAfter,
  getSummary, getExpensesByCategory, getExpensesBySubcategory, getBigExpensesBreakdown, getDailyExpenses, getExpensesByType, getMonthlyExpenses, getExpensesByDayOfWeek,
  getBudgetSettings, setBudgetSetting, getCashFlow,
  getMandatoryExpensePlan, addMandatoryExpenseItem, updateMandatoryExpenseItem, deleteMandatoryExpenseItem,
  getRecurringOperations, addRecurringOperation, updateRecurringOperation, deleteRecurringOperation, getPendingRecurringOperations, confirmRecurringOperation,
  getSavingsAccounts, getSavingsAccount, addSavingsAccount, updateSavingsAccount, deleteSavingsAccount,
  getSavingsTransactions, addSavingsDeposit, addSavingsWithdrawal, applyAccruedInterest,
  getPendingSavingsInterest, getSavingsForecast, updateSavingsAccountsOrder, getAccountsForAutoContribute,
  getEarlyPaymentCandidates, markPaymentsEarly,
  getAccounts, addAccount, updateAccount, addTransfer,
  getCategoryBudgets, setCategoryBudget,
  getImportRules, saveImportRule, deleteImportRule,
  getMonthlyTotals, getNetWorthHistory, runAutoBackup,
  exportDb, importDb, getDbPath
} from './database'
import { buildAppMenu } from './menu'
import { initUpdater, checkForUpdatesManual } from './updater'
import ExcelJS from 'exceljs'
import { parseCsvLine } from './finance'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
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

async function doExportDb(): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: `ucet-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  })
  if (!result.canceled && result.filePath) {
    await exportDb(result.filePath)
    return result.filePath
  }
  return null
}

async function doImportDb(): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile']
  })
  if (!result.canceled && result.filePaths[0]) {
    importDb(result.filePaths[0])
    return true
  }
  return false
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ucet.app')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // Русское меню — устанавливается до создания окна
  buildAppMenu({
    onExportDb: () => { doExportDb() },
    onImportDb: async () => {
      const ok = await doImportDb()
      if (ok) BrowserWindow.getAllWindows().forEach(w => w.webContents.reload())
    },
    onCheckUpdates: () => checkForUpdatesManual(),
  })
  initUpdater()

  // ── Operations ──────────────────────────────────────
  ipcMain.handle('get-operations', (_, filters) => getOperations(filters))
  ipcMain.handle('add-operation', (_, op) => addOperation(op))
  ipcMain.handle('import-operations', (_, ops, options) => importOperations(ops, options))
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
  ipcMain.handle('process-simple-payment', (_, debtId, amount, date, interestPart, paymentType) => processSimplePayment(debtId, amount, date, interestPart, paymentType))
  ipcMain.handle('get-dad-forecast', (_, debtId, payment) => getDadForecast(debtId, payment))
  ipcMain.handle('get-simple-forecast', (_, debtId, payment) => getSimpleForecast(debtId, payment))
  ipcMain.handle('mark-dad-payment-sufficient', (_, paymentId) => markDadPaymentSufficient(paymentId))
  ipcMain.handle('delete-dad-payment', (_, paymentId) => deleteDadPayment(paymentId))
  ipcMain.handle('update-dad-payment', (_, paymentId, date, amount) => updateDadPayment(paymentId, date, amount))
  ipcMain.handle('delete-simple-debt-payment', (_, paymentId) => deleteSimpleDebtPayment(paymentId))
  ipcMain.handle('update-simple-debt-payment', (_, paymentId, amount, date, interestPart) => updateSimpleDebtPayment(paymentId, amount, date, interestPart))
  ipcMain.handle('has-dad-payments-after', (_, paymentId) => hasDadPaymentsAfter(paymentId))
  ipcMain.handle('has-simple-payments-after', (_, paymentId) => hasSimplePaymentsAfter(paymentId))
  ipcMain.handle('get-early-payment-candidates', () => getEarlyPaymentCandidates())
  ipcMain.handle('mark-payments-early', (_, ids) => markPaymentsEarly(ids))

  // ── Accounts / Budgets / Rules / Reports (Этап 7) ────
  ipcMain.handle('get-accounts', (_, includeArchived) => getAccounts(includeArchived))
  ipcMain.handle('add-account', (_, data) => addAccount(data))
  ipcMain.handle('update-account', (_, id, data) => updateAccount(id, data))
  ipcMain.handle('add-transfer', (_, fromId, toId, amount, date, comment) => addTransfer(fromId, toId, amount, date, comment))
  ipcMain.handle('get-category-budgets', (_, year, month) => getCategoryBudgets(year, month))
  ipcMain.handle('set-category-budget', (_, categoryId, limit, rollover) => setCategoryBudget(categoryId, limit, rollover))
  ipcMain.handle('get-import-rules', () => getImportRules())
  ipcMain.handle('save-import-rule', (_, rule) => saveImportRule(rule))
  ipcMain.handle('delete-import-rule', (_, id) => deleteImportRule(id))
  ipcMain.handle('get-monthly-totals', (_, dateFrom, dateTo) => getMonthlyTotals(dateFrom, dateTo))
  ipcMain.handle('get-net-worth-history', (_, months) => getNetWorthHistory(months))
  ipcMain.handle('run-auto-backup', () => runAutoBackup())

  ipcMain.handle('export-operations-xlsx', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `ucet-operations-${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null
    const ops = getOperations({}) as Array<Record<string, unknown>>
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Операции')
    ws.columns = [
      { header: 'Дата', key: 'date', width: 12 },
      { header: 'Тип', key: 'type', width: 12 },
      { header: 'Сумма', key: 'amount', width: 14 },
      { header: 'Категория', key: 'category_name', width: 20 },
      { header: 'Подкатегория', key: 'subcategory_name', width: 20 },
      { header: 'Вид расхода', key: 'expense_type', width: 14 },
      { header: 'Счёт', key: 'account_name', width: 16 },
      { header: 'Теги', key: 'tags', width: 16 },
      { header: 'Комментарий', key: 'comment', width: 40 },
    ]
    const typeLabels: Record<string, string> = { income: 'Доход', expense: 'Расход', debt_op: 'По долгу', transfer: 'Перевод' }
    const etLabels: Record<string, string> = { daily: 'Повседневный', big: 'Крупный', apartment: 'На квартиру' }
    for (const o of ops) {
      ws.addRow({
        ...o,
        type: typeLabels[o.type as string] ?? o.type,
        expense_type: o.expense_type ? etLabels[o.expense_type as string] ?? o.expense_type : '',
      })
    }
    ws.getRow(1).font = { bold: true }
    await wb.xlsx.writeFile(result.filePath)
    return result.filePath
  })

  ipcMain.handle('export-report-xlsx', async (_, dateFrom: string, dateTo: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `ucet-report-${dateFrom}-${dateTo}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null
    const wb = new ExcelJS.Workbook()
    const wsM = wb.addWorksheet('По месяцам')
    wsM.columns = [
      { header: 'Месяц', key: 'month', width: 12 },
      { header: 'Доходы', key: 'income', width: 14 },
      { header: 'Расходы', key: 'expense', width: 14 },
      { header: 'Платежи по долгам', key: 'debt_ops', width: 18 },
    ]
    for (const row of getMonthlyTotals(dateFrom, dateTo) as Array<Record<string, unknown>>) wsM.addRow(row)
    wsM.getRow(1).font = { bold: true }
    const wsC = wb.addWorksheet('По категориям')
    wsC.columns = [
      { header: 'Категория', key: 'name', width: 24 },
      { header: 'Сумма за период', key: 'total', width: 16 },
    ]
    for (const row of getExpensesByCategory(dateFrom, dateTo) as Array<Record<string, unknown>>) wsC.addRow(row)
    wsC.getRow(1).font = { bold: true }
    await wb.xlsx.writeFile(result.filePath)
    return result.filePath
  })

  // Автобэкап при запуске (не блокирует старт)
  runAutoBackup().catch(() => { /* нет прав на папку и т.п. — не мешаем запуску */ })

  // ── Recurring operations ─────────────────────────────
  ipcMain.handle('get-recurring-operations', (_, activeOnly) => getRecurringOperations(activeOnly))
  ipcMain.handle('add-recurring-operation', (_, r) => addRecurringOperation(r))
  ipcMain.handle('update-recurring-operation', (_, id, data) => updateRecurringOperation(id, data))
  ipcMain.handle('delete-recurring-operation', (_, id) => deleteRecurringOperation(id))
  ipcMain.handle('get-pending-recurring-operations', () => getPendingRecurringOperations())
  ipcMain.handle('confirm-recurring-operation', (_, id, date) => confirmRecurringOperation(id, date))

  // ── Savings goals ────────────────────────────────────
  // Savings accounts
  ipcMain.handle('get-savings-accounts', () => getSavingsAccounts())
  ipcMain.handle('get-savings-account', (_, id) => getSavingsAccount(id))
  ipcMain.handle('add-savings-account', (_, data) => addSavingsAccount(data))
  ipcMain.handle('update-savings-account', (_, id, data) => updateSavingsAccount(id, data))
  ipcMain.handle('delete-savings-account', (_, id) => deleteSavingsAccount(id))
  ipcMain.handle('get-savings-transactions', (_, accountId) => getSavingsTransactions(accountId))
  ipcMain.handle('add-savings-deposit', (_, accountId, amount, date, comment) => addSavingsDeposit(accountId, amount, date, comment))
  ipcMain.handle('add-savings-withdrawal', (_, accountId, amount, date, comment) => addSavingsWithdrawal(accountId, amount, date, comment))
  ipcMain.handle('apply-accrued-interest', (_, accountId) => applyAccruedInterest(accountId))
  ipcMain.handle('get-pending-savings-interest', () => getPendingSavingsInterest())
  ipcMain.handle('get-savings-forecast', (_, accountId, monthlyContribution, months) => getSavingsForecast(accountId, monthlyContribution, months))
  ipcMain.handle('update-savings-accounts-order', (_, ids) => updateSavingsAccountsOrder(ids))
  ipcMain.handle('get-accounts-for-auto-contribute', () => getAccountsForAutoContribute())

  // ── Analytics ────────────────────────────────────────
  ipcMain.handle('get-summary', (_, dateFrom, dateTo, expenseType) => getSummary(dateFrom, dateTo, expenseType))
  ipcMain.handle('get-expenses-by-category', (_, dateFrom, dateTo, expenseType) => getExpensesByCategory(dateFrom, dateTo, expenseType))
  ipcMain.handle('get-expenses-by-subcategory', (_, categoryId, dateFrom, dateTo, expenseType) => getExpensesBySubcategory(categoryId, dateFrom, dateTo, expenseType))
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
  ipcMain.handle('export-db', () => doExportDb())

  ipcMain.handle('import-db', () => doImportDb())

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
        const rows = lines.map(l => parseCsvLine(l, sep))
        return { headers: rows[0], rows: rows.slice(1) }
      } else {
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.readFile(filePath)
        const ws = wb.worksheets[0]
        if (!ws) return { error: 'Нет листов в файле' }
        // row.values у ExcelJS — разреженный массив: пустые ячейки в середине строки
        // дают дыры (undefined). Собираем строки плотно через getCell.
        const colCount = ws.columnCount
        const rows: string[][] = []
        ws.eachRow(row => {
          const cells: string[] = []
          for (let i = 1; i <= colCount; i++) {
            cells.push(row.getCell(i).text ?? '')
          }
          rows.push(cells)
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
