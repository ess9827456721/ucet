import { app, dialog, Menu } from 'electron'
import { getDbPath } from './database'

// Русское меню приложения (ТЗ #18, Этап 5). Роли Electron сохраняют
// стандартные горячие клавиши (Ctrl+Z/C/V, F11 и т.д.), меняются только надписи.

export interface MenuHandlers {
  onExportDb: () => void
  onImportDb: () => void
  onCheckUpdates: () => void
}

export function buildAppMenu(handlers: MenuHandlers): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const, label: 'О программе' },
            { type: 'separator' as const },
            { role: 'hide' as const, label: 'Скрыть' },
            { role: 'hideOthers' as const, label: 'Скрыть остальные' },
            { role: 'unhide' as const, label: 'Показать все' },
            { type: 'separator' as const },
            { role: 'quit' as const, label: 'Выход' },
          ],
        }]
      : []),
    {
      label: 'Файл',
      submenu: [
        { label: 'Экспорт базы данных…', click: handlers.onExportDb },
        { label: 'Импорт базы данных…', click: handlers.onImportDb },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Масштаб +' },
        { role: 'zoomOut', label: 'Масштаб −' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' },
        ...(!app.isPackaged
          ? [
              { type: 'separator' as const },
              { role: 'toggleDevTools' as const, label: 'Инструменты разработчика' },
            ]
          : []),
      ],
    },
    {
      label: 'Справка',
      submenu: [
        { label: 'Проверить обновления…', click: handlers.onCheckUpdates },
        {
          label: 'О программе',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'О программе',
              message: 'Учёт финансов',
              detail: `Версия: ${app.getVersion()}\nБаза данных: ${getDbPath()}`,
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
