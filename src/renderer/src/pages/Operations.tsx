import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, Subcategory, Operation } from '../types'
import { formatMoney, formatDate, expenseTypeLabel, getPeriodDates } from '../utils'
import TransactionModal from '../components/TransactionModal'
import ImportModal from '../components/ImportModal'

interface Props {
  onAdd: () => void
}

const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
]

export default function Operations({ onAdd }: Props) {
  const api = useApi()
  const [operations, setOperations] = useState<Operation[]>([])
  const [period, setPeriod] = useState('month')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [catFilter, setCatFilter] = useState<number | ''>('')
  const [subcatFilter, setSubcatFilter] = useState<number | ''>('')
  const [commentSearch, setCommentSearch] = useState('')
  const [debouncedComment, setDebouncedComment] = useState('')
  const [cats, setCats] = useState<Category[]>([])
  const [subcats, setSubcats] = useState<Subcategory[]>([])
  const [editOp, setEditOp] = useState<Operation | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getCategories().then(d => setCats(d as Category[]))
  }, [])

  useEffect(() => {
    if (catFilter) {
      api.getSubcategories(catFilter as number).then(d => setSubcats(d as Subcategory[]))
    } else {
      setSubcats([])
      setSubcatFilter('')
    }
  }, [catFilter])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedComment(commentSearch), 300)
    return () => clearTimeout(t)
  }, [commentSearch])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = getPeriodDates(period)
    const filters: Record<string, unknown> = { dateFrom: from, dateTo: to }
    if (typeFilter) filters.type = typeFilter
    if (catFilter) filters.categoryId = catFilter
    if (subcatFilter) filters.subcategoryId = subcatFilter
    if (debouncedComment) filters.commentSearch = debouncedComment
    const ops = await api.getOperations(filters)
    setOperations(ops as Operation[])
    setLoading(false)
  }, [period, typeFilter, catFilter, subcatFilter, debouncedComment])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: number) {
    if (!confirm('Удалить операцию?')) return
    await api.deleteOperation(id)
    load()
  }

  function typeLabel(type: string): string {
    switch (type) {
      case 'income': return 'Доход'
      case 'expense': return 'Расход'
      case 'transfer': return 'Перевод'
      case 'debt_op': return 'Долг'
      default: return type
    }
  }

  function typeColor(type: string): string {
    switch (type) {
      case 'income': return 'text-green-400'
      case 'expense': return 'text-red-400'
      case 'debt_op': return 'text-yellow-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Операции</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Импорт
          </button>
          <button onClick={onAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex gap-1 bg-dark-800 rounded-xl p-1 border border-dark-600">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === p.id ? 'bg-yellow-400 text-dark-900' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="select w-36"
          >
            <option value="">Все типы</option>
            <option value="expense">Расходы</option>
            <option value="income">Доходы</option>
            <option value="transfer">Переводы</option>
            <option value="debt_op">По долгу</option>
          </select>
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : '')}
            className="select w-44"
          >
            <option value="">Все категории</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {subcats.length > 0 && (
            <select
              value={subcatFilter}
              onChange={e => setSubcatFilter(e.target.value ? Number(e.target.value) : '')}
              className="select w-44"
            >
              <option value="">Все подкатегории</option>
              {subcats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <input
            type="text"
            value={commentSearch}
            onChange={e => setCommentSearch(e.target.value)}
            placeholder="Поиск по комментарию..."
            className="input w-52 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-600">
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Дата</th>
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Тип</th>
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Категория</th>
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Подкатегория</th>
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Расход</th>
              <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Сумма</th>
              <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Комментарий</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-500">Загрузка...</td>
              </tr>
            ) : operations.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-500">Нет операций за выбранный период</td>
              </tr>
            ) : operations.map(op => (
              <tr key={op.id} className="table-row">
                <td className="px-5 py-3 text-sm text-gray-300">{formatDate(op.date)}</td>
                <td className="px-5 py-3">
                  <span className={`text-sm font-medium ${typeColor(op.type)}`}>{typeLabel(op.type)}</span>
                </td>
                <td className="px-5 py-3">
                  {op.category_name && (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: op.category_color || '#FFD600' }}
                      />
                      <span className="text-sm text-white">{op.category_name}</span>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-sm text-gray-400">{op.subcategory_name || '—'}</td>
                <td className="px-5 py-3 text-sm text-gray-400">{expenseTypeLabel(op.expense_type)}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`text-sm font-semibold ${op.type === 'income' ? 'text-green-400' : 'text-white'}`}>
                    {op.type === 'income' ? '+' : '−'}{formatMoney(op.amount)}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-400 max-w-xs truncate">{op.comment || ''}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => setEditOp(op)}
                      className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(op.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editOp && (
        <TransactionModal
          editOperation={editOp as unknown as Record<string, unknown>}
          onClose={() => setEditOp(null)}
          onSaved={() => { setEditOp(null); load() }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
