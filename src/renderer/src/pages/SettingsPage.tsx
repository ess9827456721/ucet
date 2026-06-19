import React, { useEffect, useState } from 'react'
import { Plus, Archive, Download, Upload, FolderOpen } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, Subcategory } from '../types'

export default function SettingsPage() {
  const api = useApi()
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [dbPath, setDbPath] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  // New category form
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense')
  const [newCatColor, setNewCatColor] = useState('#FFD600')

  // New subcategory form
  const [newSubName, setNewSubName] = useState('')

  async function loadCategories() {
    const cats = await api.getCategories()
    setCategories(cats as Category[])
  }

  async function loadSubs(catId: number) {
    const subs = await api.getSubcategories(catId)
    setSubcategories(subs as Subcategory[])
  }

  useEffect(() => {
    loadCategories()
    api.getDbPath().then(p => setDbPath(p))
  }, [])

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

      {/* Backup */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-white">Резервное копирование</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <FolderOpen size={14} />
          <span className="font-mono break-all">{dbPath}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportDb} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> Экспортировать базу данных
          </button>
          <button onClick={handleImportDb} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Импортировать базу данных
          </button>
        </div>
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
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">Расходы ({expenseCats.length})</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                {expenseCats.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      selectedCat?.id === cat.id
                        ? 'bg-dark-600 border border-yellow-400/30'
                        : 'hover:bg-dark-700'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="flex-1 text-sm text-white">{cat.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); archiveCategory(cat.id) }}
                      className="text-gray-600 hover:text-yellow-400 transition-colors"
                      title="Архивировать"
                    >
                      <Archive size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">Доходы ({incomeCats.length})</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                {incomeCats.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      selectedCat?.id === cat.id ? 'bg-dark-600 border border-yellow-400/30' : 'hover:bg-dark-700'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="flex-1 text-sm text-white">{cat.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); archiveCategory(cat.id) }}
                      className="text-gray-600 hover:text-yellow-400 transition-colors"
                    >
                      <Archive size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
                    <div key={sub.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-700">
                      <span className="flex-1 text-sm text-white">{sub.name}</span>
                      <button
                        onClick={() => archiveSubcategory(sub.id)}
                        className="text-gray-600 hover:text-yellow-400 transition-colors"
                      >
                        <Archive size={14} />
                      </button>
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
