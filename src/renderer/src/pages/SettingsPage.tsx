import React, { useEffect, useState } from 'react'
import { Plus, Archive, Download, Upload, FolderOpen, Pencil, Check, X as XIcon, RefreshCw, FileSpreadsheet, Moon, Sun, Lock } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, Subcategory } from '../types'
import AccountsManager from '../components/AccountsManager'
import BudgetsManager from '../components/BudgetsManager'
import ImportRulesManager from '../components/ImportRulesManager'
import { getTheme, setTheme as applyTheme, Theme } from '../theme'

interface EditCatState { id: number; name: string; color: string }
interface EditSubState { id: number; name: string }

export default function SettingsPage() {
  const api = useApi()
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [dbPath, setDbPath] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  // Updater state
  const [appVersion, setAppVersion] = useState('')
  const [updStatus, setUpdStatus] = useState<string>('idle')
  const [updVersion, setUpdVersion] = useState('')
  const [updProgress, setUpdProgress] = useState(0)
  const [updError, setUpdError] = useState('')

  // Inline edit state
  const [editCat, setEditCat] = useState<EditCatState | null>(null)
  const [editSub, setEditSub] = useState<EditSubState | null>(null)

  // New category form
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense')
  const [newCatColor, setNewCatColor] = useState('#FFD600')

  // New subcategory form
  const [newSubName, setNewSubName] = useState('')

  // Theme + PIN (Этап 7.11, 7.13)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [pinEnabled, setPinEnabled] = useState(false)
  const [pinInput, setPinInput] = useState('')

  async function loadCategories() {
    const cats = await api.getCategories()
    setCategories(cats as Category[])
  }

  async function loadSubs(catId: number) {
    const subs = await api.getSubcategories(catId)
    setSubcategories(subs as Subcategory[])
  }

  useEffect(() => {
    setPinEnabled(!!localStorage.getItem('ucet-pin'))
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    applyTheme(next)
  }

  function savePin() {
    if (pinInput.length < 4) { showStatus('PIN должен быть не короче 4 цифр'); return }
    // Простое хеширование (не криптостойкое — защита от случайного просмотра, не от взлома)
    let hash = 0
    for (let i = 0; i < pinInput.length; i++) hash = (hash * 31 + pinInput.charCodeAt(i)) | 0
    localStorage.setItem('ucet-pin', String(hash))
    setPinEnabled(true)
    setPinInput('')
    showStatus('PIN-код установлен')
  }

  function removePin() {
    localStorage.removeItem('ucet-pin')
    setPinEnabled(false)
    showStatus('PIN-код удалён')
  }

  async function handleExportOps() {
    const path = await api.exportOperationsXlsx()
    if (path) showStatus(`Операции экспортированы: ${path}`)
  }

  useEffect(() => {
    loadCategories()
    api.getDbPath().then(p => setDbPath(p))
    api.updaterVersion?.().then(v => setAppVersion(v)).catch(() => {})
    const unsubscribe = api.onUpdaterStatus?.(payload => {
      const st = payload.status as string
      setUpdStatus(st)
      if (st === 'available' || st === 'downloaded') setUpdVersion(String(payload.version ?? ''))
      if (st === 'progress') setUpdProgress(Number(payload.percent ?? 0))
      if (st === 'error') setUpdError(String(payload.message ?? ''))
      else setUpdError('')
    })
    return () => { unsubscribe?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCheckUpdates() {
    setUpdError('')
    const r = await api.updaterCheck()
    if (r?.dev) {
      setUpdStatus('idle')
      showStatus('Проверка обновлений доступна только в установленной версии приложения')
    }
  }

  useEffect(() => {
    if (selectedCat) loadSubs(selectedCat.id)
    else setSubcategories([])
  }, [selectedCat])

  async function addCategory() {
    if (!newCatName.trim()) return
    await api.addCategory({ name: newCatName, type: newCatType, color: newCatColor })
    setNewCatName('')
    loadCategories()
    showStatus('Категория добавлена')
  }

  async function archiveCategory(id: number) {
    await api.updateCategory(id, { archived: 1 })
    loadCategories()
    if (selectedCat?.id === id) setSelectedCat(null)
    showStatus('Категория архивирована')
  }

  async function addSubcategory() {
    if (!newSubName.trim() || !selectedCat) return
    await api.addSubcategory({ category_id: selectedCat.id, name: newSubName })
    setNewSubName('')
    loadSubs(selectedCat.id)
    showStatus('Подкатегория добавлена')
  }

  async function archiveSubcategory(id: number) {
    await api.updateSubcategory(id, { archived: 1 })
    if (selectedCat) loadSubs(selectedCat.id)
    showStatus('Подкатегория архивирована')
  }

  async function saveEditCat() {
    if (!editCat || !editCat.name.trim()) return
    await api.updateCategory(editCat.id, { name: editCat.name.trim(), color: editCat.color })
    setEditCat(null)
    loadCategories()
    showStatus('Категория обновлена')
  }

  async function saveEditSub() {
    if (!editSub || !editSub.name.trim()) return
    await api.updateSubcategory(editSub.id, { name: editSub.name.trim() })
    setEditSub(null)
    if (selectedCat) loadSubs(selectedCat.id)
    showStatus('Подкатегория обновлена')
  }

  async function handleExportDb() {
    const path = await api.exportDb()
    if (path) showStatus(`Резервная копия сохранена: ${path}`)
  }

  async function handleImportDb() {
    if (!confirm('Текущие данные будут заменены данными из файла. Продолжить?')) return
    const ok = await api.importDb()
    if (ok) { showStatus('База данных восстановлена. Перезапустите приложение.') }
  }

  function showStatus(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const expenseCats = categories.filter(c => c.type === 'expense')
  const incomeCats = categories.filter(c => c.type === 'income')

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Настройки</h1>

      {statusMsg && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 text-green-400 text-sm">
          {statusMsg}
        </div>
      )}

      {/* Внешний вид + безопасность */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-white">Внешний вид и безопасность</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Тема оформления</span>
          <button onClick={toggleTheme} className="btn-secondary flex items-center gap-2 text-sm">
            {theme === 'dark' ? <><Moon size={14} /> Тёмная</> : <><Sun size={14} /> Светлая</>}
          </button>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-dark-600">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-gray-400" />
            <span className="text-sm text-gray-300">PIN-код при запуске {pinEnabled && <span className="text-green-400">(включён)</span>}</span>
          </div>
          {pinEnabled ? (
            <button onClick={removePin} className="btn-secondary text-sm">Удалить PIN</button>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="4–8 цифр"
                className="input w-28 py-1.5 text-sm"
              />
              <button onClick={savePin} className="btn-primary text-sm">Установить</button>
            </div>
          )}
        </div>
      </div>

      {/* Счета */}
      <AccountsManager />

      {/* Бюджеты */}
      <BudgetsManager />

      {/* Правила импорта */}
      <ImportRulesManager />

      {/* Backup */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-white">Резервное копирование</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <FolderOpen size={14} />
          <span className="font-mono break-all">{dbPath}</span>
        </div>
        <p className="text-xs text-gray-500">Автоматический бэкап создаётся при запуске раз в день (хранятся последние 14 копий).</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={handleExportDb} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> Экспортировать базу данных
          </button>
          <button onClick={handleImportDb} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Импортировать базу данных
          </button>
          <button onClick={handleExportOps} className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={16} /> Экспорт операций в XLSX
          </button>
        </div>
      </div>

      {/* Updates */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-white">Обновления</h2>
        <p className="text-xs text-gray-500">Текущая версия: <span className="text-white font-mono">{appVersion || '—'}</span></p>
        {updStatus === 'checking' && <p className="text-sm text-gray-400">Проверка обновлений…</p>}
        {updStatus === 'not-available' && <p className="text-sm text-green-400">Установлена последняя версия</p>}
        {updStatus === 'available' && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-yellow-400">Доступна новая версия {updVersion}</p>
            <button onClick={() => api.updaterDownload()} className="btn-primary text-sm">Скачать</button>
          </div>
        )}
        {updStatus === 'progress' && (
          <div className="space-y-1">
            <p className="text-sm text-gray-400">Скачивание обновления: {updProgress}%</p>
            <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all" style={{ width: `${updProgress}%` }} />
            </div>
          </div>
        )}
        {updStatus === 'downloaded' && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-green-400">Обновление {updVersion} скачано</p>
            <button onClick={() => api.updaterInstall()} className="btn-primary text-sm">Перезапустить и установить</button>
          </div>
        )}
        {updError && <p className="text-sm text-red-400">Ошибка обновления: {updError}</p>}
        <button onClick={handleCheckUpdates} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Проверить обновления
        </button>
      </div>

      {/* Categories */}
      <div className="card space-y-5">
        <h2 className="text-base font-semibold text-white">Управление категориями</h2>

        {/* Add category */}
        <div className="space-y-3 pb-4 border-b border-dark-600">
          <h3 className="text-sm font-medium text-gray-300">Добавить категорию</h3>
          <div className="flex gap-3">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Название категории"
              className="input flex-1"
            />
            <select
              value={newCatType}
              onChange={e => setNewCatType(e.target.value as 'expense' | 'income')}
              className="select w-36"
            >
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
            </select>
            <input
              type="color"
              value={newCatColor}
              onChange={e => setNewCatColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-dark-500 bg-dark-700 cursor-pointer p-1"
            />
            <button onClick={addCategory} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Category lists */}
          <div className="space-y-4">
            {([
              { label: 'Расходы', cats: expenseCats },
              { label: 'Доходы', cats: incomeCats },
            ] as const).map(({ label, cats }) => (
              <div key={label}>
                <h3 className="text-sm font-medium text-gray-400 mb-2">{label} ({cats.length})</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                  {cats.length === 0 && (
                    <p className="text-xs text-gray-600 px-3 py-1">Нет категорий</p>
                  )}
                  {cats.map(cat => (
                    <div key={cat.id}>
                      {editCat?.id === cat.id ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-dark-600 border border-yellow-400/30">
                          <input
                            type="color"
                            value={editCat.color}
                            onChange={e => setEditCat({ ...editCat, color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
                          />
                          <input
                            value={editCat.name}
                            onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditCat(); if (e.key === 'Escape') setEditCat(null) }}
                            className="input py-0.5 text-sm flex-1 h-7"
                            autoFocus
                          />
                          <button onClick={saveEditCat} className="text-green-400 hover:text-green-300 transition-colors p-1" title="Сохранить">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditCat(null)} className="text-gray-500 hover:text-white transition-colors p-1" title="Отмена">
                            <XIcon size={14} />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => { setSelectedCat(selectedCat?.id === cat.id ? null : cat); setEditCat(null) }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all group ${
                            selectedCat?.id === cat.id
                              ? 'bg-dark-600 border border-yellow-400/30'
                              : 'hover:bg-dark-700'
                          }`}
                        >
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 text-sm text-white">{cat.name}</span>
                          <button
                            onClick={e => { e.stopPropagation(); setEditCat({ id: cat.id, name: cat.name, color: cat.color }); setSelectedCat(null) }}
                            className="text-gray-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Переименовать"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); archiveCategory(cat.id) }}
                            className="text-gray-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Архивировать"
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Subcategories */}
          <div>
            {selectedCat ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Подкатегории — <span className="text-white">{selectedCat.name}</span>
                </h3>
                <div className="flex gap-2">
                  <input
                    value={newSubName}
                    onChange={e => setNewSubName(e.target.value)}
                    placeholder="Новая подкатегория"
                    className="input flex-1"
                    onKeyDown={e => e.key === 'Enter' && addSubcategory()}
                  />
                  <button onClick={addSubcategory} className="btn-primary px-3">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                  {subcategories.length === 0 ? (
                    <p className="text-sm text-gray-500 px-3">Нет подкатегорий</p>
                  ) : subcategories.map(sub => (
                    <div key={sub.id}>
                      {editSub?.id === sub.id ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-dark-600 border border-yellow-400/30">
                          <input
                            value={editSub.name}
                            onChange={e => setEditSub({ ...editSub, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditSub(); if (e.key === 'Escape') setEditSub(null) }}
                            className="input py-0.5 text-sm flex-1 h-7"
                            autoFocus
                          />
                          <button onClick={saveEditSub} className="text-green-400 hover:text-green-300 transition-colors p-1">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditSub(null)} className="text-gray-500 hover:text-white transition-colors p-1">
                            <XIcon size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-700 group">
                          <span className="flex-1 text-sm text-white">{sub.name}</span>
                          <button
                            onClick={() => setEditSub({ id: sub.id, name: sub.name })}
                            className="text-gray-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Переименовать"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => archiveSubcategory(sub.id)}
                            className="text-gray-600 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                Выберите категорию для управления подкатегориями
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
