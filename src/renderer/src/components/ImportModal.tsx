import React, { useState } from 'react'
import { X, Upload, ChevronRight, Check, AlertCircle } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, Subcategory } from '../types'
import { today } from '../utils'

interface Props {
  onClose: () => void
  onImported: () => void
}

type ColRole = 'date' | 'amount' | 'category' | 'subcategory' | 'comment' | 'ignore'
const COL_ROLES: Array<{ id: ColRole; label: string }> = [
  { id: 'date', label: 'Дата' },
  { id: 'amount', label: 'Сумма' },
  { id: 'category', label: 'Категория' },
  { id: 'subcategory', label: 'Подкатегория' },
  { id: 'comment', label: 'Комментарий' },
  { id: 'ignore', label: 'Игнорировать' },
]

type ExpenseType = 'daily' | 'big' | 'apartment'

function parseDate(raw: string): string | null {
  const s = raw.trim()
  // DD.MM.YYYY
  const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) return s
  // DD/MM/YYYY
  const m3 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m3) return `${m3[3]}-${m3[2]}-${m3[1]}`
  return null
}

function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) || n <= 0 ? null : n
}

export default function ImportModal({ onClose, onImported }: Props) {
  const api = useApi()
  const [step, setStep] = useState<'idle' | 'mapping' | 'categories' | 'preview' | 'done'>('idle')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [colRoles, setColRoles] = useState<ColRole[]>([])
  const [expenseType, setExpenseType] = useState<ExpenseType>('daily')
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [catMapping, setCatMapping] = useState<Record<string, number>>({})
  const [newCatNames, setNewCatNames] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  async function openFile() {
    setLoading(true)
    setError('')
    try {
      const result = await api.openImportFile()
      if (!result) { setLoading(false); return }
      if ('error' in result) { setError(result.error); setLoading(false); return }
      setHeaders(result.headers)
      setRows(result.rows.filter(r => r.some(c => c.trim())))

      // Auto-detect column roles by header name
      const roles: ColRole[] = result.headers.map(h => {
        const l = h.toLowerCase()
        if (l.includes('дата') || l.includes('date')) return 'date'
        if (l.includes('сумм') || l.includes('amount') || l.includes('стоим')) return 'amount'
        if (l.includes('подкатег') || l.includes('subcat')) return 'subcategory'
        if (l.includes('катег') || l.includes('category')) return 'category'
        if (l.includes('коммент') || l.includes('comment') || l.includes('наимен')) return 'comment'
        return 'ignore'
      })
      setColRoles(roles)
      setStep('mapping')
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  async function proceedToCategories() {
    const catCol = colRoles.indexOf('category')
    if (catCol === -1) {
      proceedToPreview()
      return
    }
    const allCats = await api.getCategories('expense')
    setCategories(allCats as Category[])
    const allSubs = await api.getSubcategories()
    setSubcategories(allSubs as Subcategory[])

    const uniqueCats = Array.from(new Set(rows.map(r => r[catCol]?.trim()).filter(Boolean)))
    const mapping: Record<string, number> = {}
    for (const name of uniqueCats) {
      const match = (allCats as Category[]).find(c => c.name.toLowerCase() === name.toLowerCase())
      if (match) mapping[name] = match.id
    }
    setCatMapping(mapping)
    setStep('categories')
  }

  function proceedToPreview() {
    setStep('preview')
  }

  function parsedRows() {
    const dateCol = colRoles.indexOf('date')
    const amtCol = colRoles.indexOf('amount')
    const catCol = colRoles.indexOf('category')
    const subcatCol = colRoles.indexOf('subcategory')
    const commentCol = colRoles.indexOf('comment')

    return rows.map((row, i) => {
      const rawDate = dateCol >= 0 ? row[dateCol] ?? '' : ''
      const rawAmt = amtCol >= 0 ? row[amtCol] ?? '' : ''
      const rawCat = catCol >= 0 ? row[catCol]?.trim() ?? '' : ''
      const rawSubcat = subcatCol >= 0 ? row[subcatCol]?.trim() ?? '' : ''
      const comment = commentCol >= 0 ? row[commentCol]?.trim() ?? '' : ''

      const date = parseDate(rawDate) ?? today()
      const amount = parseAmount(rawAmt)
      const catId = rawCat ? catMapping[rawCat] ?? null : null
      const subcatId = rawSubcat && catId
        ? subcategories.find(s => s.category_id === catId && s.name.toLowerCase() === rawSubcat.toLowerCase())?.id ?? null
        : null

      return {
        rowIdx: i,
        date,
        amount,
        category_id: catId,
        subcategory_id: subcatId,
        comment: comment || null,
        rawDate,
        rawAmt,
        valid: amount !== null,
      }
    })
  }

  async function runImport() {
    setImporting(true)
    setError('')
    try {
      const newCatMap: Record<string, number> = { ...catMapping }
      for (const name of newCatNames) {
        if (!newCatMap[name]) {
          const id = await api.addCategory({ name, type: 'expense', color: '#94A3B8' })
          newCatMap[name] = id
        }
      }

      const catCol = colRoles.indexOf('category')
      const subcatCol = colRoles.indexOf('subcategory')
      const commentCol = colRoles.indexOf('comment')
      const dateCol = colRoles.indexOf('date')
      const amtCol = colRoles.indexOf('amount')

      const ops = rows
        .map(row => {
          const rawAmt = amtCol >= 0 ? row[amtCol] ?? '' : ''
          const amount = parseAmount(rawAmt)
          if (!amount) return null
          const rawDate = dateCol >= 0 ? row[dateCol] ?? '' : ''
          const rawCat = catCol >= 0 ? row[catCol]?.trim() ?? '' : ''
          const rawSubcat = subcatCol >= 0 ? row[subcatCol]?.trim() ?? '' : ''
          const comment = commentCol >= 0 ? row[commentCol]?.trim() ?? '' : ''
          const date = parseDate(rawDate) ?? today()
          const catId = rawCat ? newCatMap[rawCat] ?? null : null
          const subcatId = rawSubcat && catId
            ? subcategories.find(s => s.category_id === catId && s.name.toLowerCase() === rawSubcat.toLowerCase())?.id ?? null
            : null
          return { date, type: 'expense', amount, category_id: catId, subcategory_id: subcatId, expense_type: expenseType, comment: comment || null }
        })
        .filter(Boolean) as Record<string, unknown>[]

      const count = await api.importOperations(ops)
      setImportedCount(count)
      setStep('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
    }
  }

  const parsed = step === 'preview' ? parsedRows() : []
  const validCount = parsed.filter(r => r.valid).length
  const skippedCount = parsed.filter(r => !r.valid)
  const uniqueCatValues = step === 'categories'
    ? Array.from(new Set(rows.map(r => r[colRoles.indexOf('category')]?.trim()).filter(Boolean)))
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-3xl w-full max-w-2xl mx-4 shadow-2xl border border-dark-500 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-dark-600">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload size={18} className="text-yellow-400" />
            Импорт из файла
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
          {/* Step: idle */}
          {step === 'idle' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">
                Поддерживаются файлы Excel (.xlsx, .xls) и CSV. После выбора файла вы сможете указать, какие колонки соответствуют дате, сумме и категории.
              </p>
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}
              <button onClick={openFile} disabled={loading} className="btn-primary w-full">
                {loading ? 'Открытие...' : 'Выбрать файл...'}
              </button>
            </div>
          )}

          {/* Step: column mapping */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Укажите, что содержит каждая колонка файла. Строки 1–3 для примера:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="text-left pb-2 pr-3 text-gray-400 font-normal">{h || `Колонка ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci} className="pr-3 pb-1 text-gray-300 max-w-[120px] truncate">{row[ci] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-white w-40 truncate">{h || `Колонка ${i + 1}`}</span>
                    <select
                      value={colRoles[i] ?? 'ignore'}
                      onChange={e => {
                        const r = [...colRoles]
                        r[i] = e.target.value as ColRole
                        setColRoles(r)
                      }}
                      className="select flex-1"
                    >
                      {COL_ROLES.map(cr => (
                        <option key={cr.id} value={cr.id}>{cr.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div>
                <label className="label">Тип расхода для всего импорта</label>
                <div className="flex gap-2">
                  {[['daily', 'Повседневный'], ['big', 'Крупный'], ['apartment', 'На квартиру']].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setExpenseType(v as ExpenseType)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${expenseType === v ? 'bg-yellow-400 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {!colRoles.includes('amount') && (
                <p className="text-yellow-400 text-xs flex items-center gap-1"><AlertCircle size={12} /> Укажите колонку «Сумма»</p>
              )}
            </div>
          )}

          {/* Step: category mapping */}
          {step === 'categories' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">Сопоставьте категории из файла с категориями приложения:</p>
              {uniqueCatValues.map(name => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-white w-40 truncate">{name}</span>
                  <span className="text-gray-500 text-sm">→</span>
                  <select
                    value={catMapping[name] ?? ''}
                    onChange={e => {
                      const val = e.target.value
                      setCatMapping(prev => ({ ...prev, [name]: val ? parseInt(val) : 0 }))
                      if (!val) {
                        setNewCatNames(prev => new Set([...prev, name]))
                      } else {
                        setNewCatNames(prev => { const s = new Set(prev); s.delete(name); return s })
                      }
                    }}
                    className="select flex-1"
                  >
                    <option value="">Создать новую «{name}»</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ))}
              {uniqueCatValues.length === 0 && (
                <p className="text-gray-500 text-sm">Колонка категорий не выбрана — все операции будут импортированы без категории.</p>
              )}
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="card text-center">
                  <p className="text-2xl font-bold text-white">{parsed.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Строк всего</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-green-400">{validCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Будет импортировано</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-red-400">{skippedCount.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Пропущено (нет суммы)</p>
                </div>
              </div>
              {skippedCount.length > 0 && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-white">Показать пропущенные строки</summary>
                  <div className="mt-2 space-y-1">
                    {skippedCount.map(r => (
                      <p key={r.rowIdx}>Строка {r.rowIdx + 2}: дата={r.rawDate}, сумма={r.rawAmt}</p>
                    ))}
                  </div>
                </details>
              )}
              <div className="max-h-48 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-dark-800">
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 pr-3 text-gray-400">Дата</th>
                      <th className="text-right py-2 pr-3 text-gray-400">Сумма</th>
                      <th className="text-left py-2 pr-3 text-gray-400">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.filter(r => r.valid).slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-b border-dark-700">
                        <td className="py-1 pr-3 text-gray-300">{r.date}</td>
                        <td className="py-1 pr-3 text-right text-white">{r.amount?.toLocaleString('ru-RU')} ₽</td>
                        <td className="py-1 pr-3 text-gray-400 max-w-[200px] truncate">{r.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validCount > 30 && <p className="text-xs text-gray-500 py-2 text-center">...и ещё {validCount - 30} строк</p>}
              </div>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-3">
              <Check size={48} className="text-green-400 mx-auto" />
              <p className="text-xl font-bold text-white">Импорт завершён</p>
              <p className="text-gray-400">Импортировано операций: <b className="text-white">{importedCount}</b></p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-dark-600 flex gap-3">
          {step === 'done' ? (
            <button onClick={onImported} className="btn-primary flex-1">Готово</button>
          ) : step === 'mapping' ? (
            <>
              <button onClick={() => setStep('idle')} className="btn-secondary flex-1">Назад</button>
              <button
                onClick={proceedToCategories}
                disabled={!colRoles.includes('amount')}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                Далее <ChevronRight size={16} />
              </button>
            </>
          ) : step === 'categories' ? (
            <>
              <button onClick={() => setStep('mapping')} className="btn-secondary flex-1">Назад</button>
              <button onClick={proceedToPreview} className="btn-primary flex-1 flex items-center justify-center gap-2">
                Далее <ChevronRight size={16} />
              </button>
            </>
          ) : step === 'preview' ? (
            <>
              <button onClick={() => setStep('categories')} className="btn-secondary flex-1">Назад</button>
              <button onClick={runImport} disabled={importing || validCount === 0} className="btn-primary flex-1">
                {importing ? 'Импорт...' : `Импортировать ${validCount} операций`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          )}
        </div>
      </div>
    </div>
  )
}
