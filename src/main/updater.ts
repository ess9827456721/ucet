import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// Автообновление через GitHub Releases (ТЗ #18, Этап 2).
// autoDownload=false — скачивание только по команде пользователя.

function send(status: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('updater:status', { status, ...(payload as Record<string, unknown> ?? {}) })
  }
}

export function initUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send('checking'))
  autoUpdater.on('update-available', info => send('available', { version: info.version }))
  autoUpdater.on('update-not-available', () => send('not-available'))
  autoUpdater.on('download-progress', p => send('progress', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', info => send('downloaded', { version: info.version }))
  autoUpdater.on('error', err => send('error', { message: String((err as Error)?.message ?? err) }))

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { dev: true }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      send('error', { message: String(e) })
    }
    return { dev: false }
  })
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      send('error', { message: String(e) })
    }
  })
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
  ipcMain.handle('updater:version', () => app.getVersion())

  // Тихая проверка через ~10 секунд после запуска (только в упакованной сборке)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => { /* нет сети — молча */ })
    }, 10_000)
  }
}

export function checkForUpdatesManual(): void {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Обновления',
      message: 'Проверка обновлений доступна только в установленной версии приложения.',
    })
    return
  }
  autoUpdater.checkForUpdates().catch(e => send('error', { message: String(e) }))
}
