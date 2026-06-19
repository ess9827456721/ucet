import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  getOperations, addOperation, updateOperation, deleteOperation,
  getCategories, getSubcategories, addCategory, updateCategory, addSubcategory, updateSubcategory,
  getDebts, getDebt, addDebt, updateDebt, getTranches, addTranche,
  processDadPayment, getDadPaymentHistory, getSimpleDebtPayments, processSimplePayment, getDadForecast, getSimpleForecast,
  getSummary, getExpensesByCategory, getDailyExpenses, getExpensesByType,
  getBudgetSettings, setBudgetSetting, getCashFlow,
  exportDb, importDb, getDbPath
} from './database'

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
  ipcMain.handle('get-debt', (_, id) => getDebt(id))
  ipcMain.handle('add-debt', (_, debt) => addDebt(debt))
  ipcMain.handle('update-debt', (_, id, data) => updateDebt(id, data))
  ipcMain.handle('get-tranches', (_, debtId) => getTranches(debtId))
  ipcMain.handle('add-tranche', (_, tranche) => addTranche(tranche))
  ipcMain.handle('process-dad-payment', (_, debtId, amount, date, days) => processDadPayment(debtId, amount, date, days))
  ipcMain.handle('get-dad-payment-history', (_, debtId) => getDadPaymentHistory(debtId))
  ipcMain.handle('get-simple-debt-payments', (_, debtId) => getSimpleDebtPayments(debtId))
  ipcMain.handle('process-simple-payment', (_, debtId, amount, date, interestPart) => processSimplePayment(debtId, amount, date, interestPart))
  ipcMain.handle('get-dad-forecast', (_, debtId, payment) => getDadForecast(debtId, payment))
  ipcMain.handle('get-simple-forecast', (_, debtId, payment) => getSimpleForecast(debtId, payment))

  // ── Analytics ────────────────────────────────────────
  ipcMain.handle('get-summary', (_, dateFrom, dateTo) => getSummary(dateFrom, dateTo))
  ipcMain.handle('get-expenses-by-category', (_, dateFrom, dateTo) => getExpensesByCategory(dateFrom, dateTo))
  ipcMain.handle('get-daily-expenses', (_, dateFrom, dateTo) => getDailyExpenses(dateFrom, dateTo))
  ipcMain.handle('get-expenses-by-type', (_, dateFrom, dateTo) => getExpensesByType(dateFrom, dateTo))

  // ── Budget ───────────────────────────────────────────
  ipcMain.handle('get-budget-settings', () => getBudgetSettings())
  ipcMain.handle('set-budget-setting', (_, key, value) => setBudgetSetting(key, value))
  ipcMain.handle('get-cash-flow', (_, year, month) => getCashFlow(year, month))

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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
