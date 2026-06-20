import React, { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Pencil, Trash2, Lock } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { CashFlowData, MandatoryExpenseItem } from '../types'
import { formatMoney, formatDate } from '../utils'

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

interface Props {
  onGoToDebt?: (id: number) => void
}

export default function CashFlow({ onGoToDebt }: Props) {
  const api = useApi()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<CashFlowData | null>(null)
  const [loading, setLoading] = useState(true)

  const [mandatoryExpanded, setMandatoryExpanded] = useState(true)

  // Mandatory items edit state
  const [editItemId, setEditItemId] = useState<number | null>(null)
  const [editPlanned, setEditPlanned] = useState('')
  const [editActual, setEditActual] = useState('')
  // Add new item
  const [showAddItem, setShowAddItem] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await api.getCashFlow(year, month)
    setData(d as CashFlowData)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function startEditItem(item: MandatoryExpenseItem) {
    setEditItemId(item.id)
    setEditPlanned(String(item.plannedAmount))
    setEditActual(item.actualAmount != null ? String(item.actualAmount) : '')
  }

  async function saveEditItem(item: MandatoryExpenseItem) {
    if (item.id == null) return
    await api.updateMandatoryExpenseItem(item.id, {
      planned_amount: parseFloat(editPlanned) || 0,
      actual_amount: editActual !== '' ? parseFloat(editActual) : null,
    })
    setEditItemId(null)
    load()
  }

  async function handleDeleteItem(id: number) {
    if (!confirm('Удалить статью?')) return
    await api.deleteMandatoryExpenseItem(id)
    load()
  }

  async function handleAddItem() {
    if (!newCategory.trim() || !newAmount) return
    setSavingItem(true)
    await api.addMandatoryExpenseItem(year, month, newCategory.trim(), parseFloat(newAmount))
    setNewCategory('')
    setNewAmount('')
    setShowAddItem(false)
    setSavingItem(false)
    load()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Кассовый поток</h1>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-semibold text-lg min-w-36 text-center">
            {MONTHS_RU[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Загрузка...</div>
      ) : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Доходы за период</p>
              <p className="text-2xl font-bold text-green-400">{formatMoney(data.income)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Обязательные расходы</p>
              <p className="text-2xl font-bold text-red-400">{formatMoney(data.mandatory)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Бюджет на день</p>
              <p className="text-2xl font-bold text-yellow-400">{formatMoney(data.dailyBudget)}</p>
              <p className="text-xs text-gray-500 mt-1">(Доходы − Обязательные) / дни</p>
            </div>
          </div>

          {/* Mandatory expenses plan */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <button
                onClick={() => setMandatoryExpanded(v => !v)}
                className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors"
              >
                {mandatoryExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                <span className="text-base font-semibold">Обязательные расходы месяца</span>
                {!mandatoryExpanded && data.mandatoryItems.length > 0 && (
                  <span className="text-sm text-gray-400 ml-1">
                    — {formatMoney(data.mandatoryItems.reduce((s, i) => s + i.plannedAmount, 0))} план
                  </span>
                )}
              </button>
              {mandatoryExpanded && (
                <button
                  onClick={() => setShowAddItem(v => !v)}
                  className="text-gray-500 hover:text-yellow-400 transition-colors p-1"
                  title="Добавить статью"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {mandatoryExpanded && showAddItem && (
              <div className="px-5 py-3 border-b border-dark-600 bg-dark-700 flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Название (Аренда, ЖКХ...)"
                  className="input py-1 text-sm flex-1 min-w-40"
                />
                <input
                  type="number"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  placeholder="Сумма, ₽"
                  className="input py-1 text-sm w-32"
                />
                <button onClick={handleAddItem} disabled={savingItem} className="btn-primary text-sm py-1 px-3">
                  {savingItem ? '...' : 'Добавить'}
                </button>
                <button onClick={() => setShowAddItem(false)} className="btn-secondary text-sm py-1 px-3">Отмена</button>
              </div>
            )}

            {mandatoryExpanded && data.mandatoryItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-500 text-sm">
                Нет статей обязательных расходов. Нажмите + чтобы добавить.
              </div>
            ) : mandatoryExpanded ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Статья</th>
                    <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">План</th>
                    <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Факт</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.mandatoryItems.map((item, idx) => (
                    <React.Fragment key={item.id ?? `debt-${idx}`}>
                      <tr className="border-b border-dark-600 hover:bg-dark-700">
                        <td className="px-5 py-3 text-sm text-gray-300 flex items-center gap-2">
                          {item.isDebtLinked && <Lock size={12} className="text-gray-600 flex-shrink-0" title="Автоматически из долга" />}
                          {item.category}
                        </td>
                        <td className="px-5 py-3 text-sm text-right text-white">{formatMoney(item.plannedAmount)}</td>
                        <td className={`px-5 py-3 text-sm text-right ${item.actualAmount != null ? (item.actualAmount > item.plannedAmount ? 'text-red-400' : 'text-green-400') : 'text-gray-500'}`}>
                          {item.actualAmount != null ? formatMoney(item.actualAmount) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {item.isDebtLinked && item.debtId != null && onGoToDebt ? (
                            <div className="flex justify-end">
                              <button
                                onClick={() => onGoToDebt(item.debtId!)}
                                className="text-xs text-gray-600 hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:bg-dark-600"
                                title="Перейти на страницу долга для редактирования"
                              >
                                → долг
                              </button>
                            </div>
                          ) : !item.isDebtLinked && item.id != null ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => startEditItem(item)} className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id!)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                      {editItemId !== null && editItemId === item.id && (
                        <tr className="bg-dark-700 border-b border-dark-600">
                          <td colSpan={4} className="px-5 py-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400">План, ₽:</span>
                                <input type="number" value={editPlanned} onChange={e => setEditPlanned(e.target.value)} className="input py-1 text-sm w-32" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400">Факт, ₽:</span>
                                <input type="number" value={editActual} onChange={e => setEditActual(e.target.value)} placeholder="не указан" className="input py-1 text-sm w-32" />
                              </div>
                              <button onClick={() => saveEditItem(item)} className="btn-primary text-sm py-1 px-3">Сохранить</button>
                              <button onClick={() => setEditItemId(null)} className="btn-secondary text-sm py-1 px-3">Отмена</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  <tr className="bg-dark-800">
                    <td className="px-5 py-3 text-sm font-semibold text-gray-300">Итого</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-white">
                      {formatMoney(data.mandatoryItems.reduce((s, i) => s + i.plannedAmount, 0))}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-300">
                      {data.mandatoryItems.some(i => i.actualAmount != null)
                        ? formatMoney(data.mandatoryItems.reduce((s, i) => s + (i.actualAmount ?? 0), 0))
                        : '—'}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>

          {/* Daily journal */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600">
              <h2 className="text-base font-semibold text-white">Дневной журнал</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Дата</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Траты за день</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Накопленный лимит</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Сальдо</th>
                </tr>
              </thead>
              <tbody>
                {data.journal.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-500">Нет операций за выбранный период</td>
                  </tr>
                ) : data.journal.map(row => (
                  <tr
                    key={row.date}
                    className={`border-b border-dark-600 ${row.saldo < 0 ? 'bg-red-900/10' : 'hover:bg-dark-700'} transition-colors`}
                  >
                    <td className="px-5 py-3 text-sm text-gray-300">{formatDate(row.date)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(row.dayExpenses)}</td>
                    <td className="px-5 py-3 text-sm text-right text-gray-300">{formatMoney(row.cumLimit)}</td>
                    <td className={`px-5 py-3 text-sm text-right font-semibold ${row.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.saldo >= 0 ? '+' : ''}{formatMoney(row.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
