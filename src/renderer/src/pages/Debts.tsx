import React, { useEffect, useRef, useState } from 'react'
import { Plus, ChevronRight, AlertTriangle, CheckCircle, Pencil, Trash2, EyeOff, Eye, GripVertical } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Debt } from '../types'
import { formatMoney, formatDate, nextPaymentDate } from '../utils'
import AddDebtModal from '../components/AddDebtModal'

interface Props {
  onOpenDebt: (id: number) => void
  onOpenForecast: (id: number) => void
}

export default function Debts({ onOpenDebt, onOpenForecast }: Props) {
  const api = useApi()
  const [debts, setDebts] = useState<Debt[]>([])
  const [showClosed, setShowClosed] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [loading, setLoading] = useState(true)
  const dragId = useRef<number | null>(null)

  async function load() {
    setLoading(true)
    const d = await api.getDebtsWithDetails()
    setDebts(d as Debt[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const handleFocus = () => load()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  async function handleDelete(debt: Debt, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Удалить долг «${debt.name}» и всю историю платежей по нему? Это действие нельзя отменить.`)) return
    await api.deleteDebt(debt.id)
    load()
  }

  async function handleToggleHidden(debt: Debt, e: React.MouseEvent) {
    e.stopPropagation()
    await api.updateDebt(debt.id, { is_hidden: debt.is_hidden ? 0 : 1 })
    load()
  }

  function handleDragStart(id: number) {
    dragId.current = id
  }

  async function handleDrop(targetId: number, groupDebts: Debt[]) {
    if (dragId.current === null || dragId.current === targetId) return
    const fromIdx = groupDebts.findIndex(d => d.id === dragId.current)
    const toIdx = groupDebts.findIndex(d => d.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const reordered = [...groupDebts]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    dragId.current = null
    // Compute new order for all active debts
    const activeVisible = active.filter(d => !d.is_hidden)
    const updatedOrder = activeVisible.map(d => {
      const found = reordered.find(r => r.id === d.id)
      return found ?? d
    })
    // Just send the reordered ids of the affected group, backend sets sort_order = index
    await api.updateDebtsOrder(reordered.map(d => d.id))
    load()
  }

  const active = debts.filter(d => d.status === 'active')
  const closed = debts.filter(d => d.status === 'closed')
  const visibleActive = active.filter(d => !d.is_hidden)
  const hiddenActive = active.filter(d => d.is_hidden)
  const iOweDebts = visibleActive.filter(d => d.direction === 'i_owe')
  const totalOwed = iOweDebts.reduce((s, d) => s + (d.current_balance ?? d.initial_amount ?? 0), 0)
  const totalAccrued = iOweDebts.reduce((s, d) => s + (d.accrued_interest ?? 0), 0)

  // Group visible active debts by category
  const groups: { category: string | null; debts: Debt[] }[] = []
  const seen = new Set<string | null>()
  for (const d of visibleActive) {
    const key = d.category ?? null
    if (!seen.has(key)) {
      seen.add(key)
      groups.push({ category: key, debts: [] })
    }
    groups.find(g => g.category === key)!.debts.push(d)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Долги</h1>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Добавить долг
        </button>
      </div>

      <div className="card">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Общая долговая нагрузка</p>
        <p className="text-3xl font-bold text-red-400">{formatMoney(totalOwed)}</p>
        {totalAccrued > 0 && (
          <p className="text-sm text-orange-400 mt-1">+ {formatMoney(totalAccrued)} накопленных %</p>
        )}
        <p className="text-sm text-gray-500 mt-1">{iOweDebts.length} активных долга</p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.category ?? '__no_cat__'}>
              {group.category && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{group.category}</h3>
                  <span className="text-xs text-gray-500">
                    {formatMoney(group.debts.filter(d => d.direction === 'i_owe').reduce((s, d) => s + (d.current_balance ?? d.initial_amount ?? 0), 0))}
                  </span>
                </div>
              )}
              <div className="space-y-3">
                {group.debts.map(debt => (
                  <DebtCard
                    key={debt.id}
                    debt={debt}
                    onClick={() => onOpenDebt(debt.id)}
                    onForecast={() => onOpenForecast(debt.id)}
                    onEdit={e => { e.stopPropagation(); setEditDebt(debt) }}
                    onDelete={e => handleDelete(debt, e)}
                    onToggleHidden={e => handleToggleHidden(debt, e)}
                    onDragStart={() => handleDragStart(debt.id)}
                    onDrop={() => handleDrop(debt.id, group.debts)}
                  />
                ))}
              </div>
            </div>
          ))}
          {visibleActive.length === 0 && (
            <div className="text-center py-10 text-gray-500">Нет активных долгов</div>
          )}
        </div>
      )}

      {/* Hidden debts */}
      {hiddenActive.length > 0 && (
        <div>
          <button
            onClick={() => setShowHidden(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-2 mb-3"
          >
            <EyeOff size={14} />
            {showHidden ? 'Скрыть' : 'Показать'} скрытые долги ({hiddenActive.length})
          </button>
          {showHidden && (
            <div className="space-y-3 opacity-60">
              {hiddenActive.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onClick={() => onOpenDebt(debt.id)}
                  onEdit={e => { e.stopPropagation(); setEditDebt(debt) }}
                  onDelete={e => handleDelete(debt, e)}
                  onToggleHidden={e => handleToggleHidden(debt, e)}
                  onDragStart={() => {}}
                  onDrop={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Closed debts */}
      {closed.length > 0 && (
        <div>
          <button
            onClick={() => setShowClosed(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-2 mb-3"
          >
            <CheckCircle size={14} />
            {showClosed ? 'Скрыть' : 'Показать'} закрытые ({closed.length})
          </button>
          {showClosed && (
            <div className="space-y-3 opacity-60">
              {closed.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onClick={() => onOpenDebt(debt.id)}
                  onEdit={e => { e.stopPropagation(); setEditDebt(debt) }}
                  onDelete={e => handleDelete(debt, e)}
                  onToggleHidden={e => handleToggleHidden(debt, e)}
                  onDragStart={() => {}}
                  onDrop={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {(showAddModal || editDebt) && (
        <AddDebtModal
          editDebt={editDebt ?? undefined}
          onClose={() => { setShowAddModal(false); setEditDebt(null) }}
          onSaved={() => { setShowAddModal(false); setEditDebt(null); load() }}
        />
      )}
    </div>
  )
}

function DebtCard({
  debt, onClick, onForecast, onEdit, onDelete, onToggleHidden, onDragStart, onDrop
}: {
  debt: Debt
  onClick: () => void
  onForecast?: () => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onToggleHidden: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDrop: () => void
}) {
  const nextDate = debt.payment_day ? nextPaymentDate(debt.payment_day) : null
  const isOverduePayment = debt.is_overdue ?? false

  return (
    <div
      className="card cursor-pointer hover:border-yellow-400/30 transition-all"
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mr-2 mt-1 text-gray-600 cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
          <GripVertical size={16} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold text-white">{debt.name}</h3>
            <span className={`badge ${
              debt.direction === 'i_owe' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'
            }`}>
              {debt.direction === 'i_owe' ? 'Я должен' : 'Мне должны'}
            </span>
            {debt.debt_type === 'dad' && (
              <span className="badge bg-yellow-900/40 text-yellow-400">Транши</span>
            )}
            {debt.status === 'closed' && (
              <span className="badge bg-dark-600 text-gray-400">Закрыт</span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500">Остаток</p>
              <p className="text-xl font-bold text-white">{formatMoney(debt.current_balance ?? debt.initial_amount ?? 0)}</p>
            </div>
            {debt.interest_rate && (
              <div>
                <p className="text-xs text-gray-500">Ставка</p>
                <p className="text-sm font-semibold text-gray-300">{(debt.interest_rate * 100).toFixed(1)}%</p>
              </div>
            )}
            {nextDate && (
              <div>
                <p className="text-xs text-gray-500">Следующий платёж</p>
                <p className={`text-sm font-semibold ${isOverduePayment ? 'text-red-400' : 'text-gray-300'}`}>
                  {formatDate(nextDate)}
                </p>
              </div>
            )}
            {debt.overdue_interest_pool > 0 && (
              <div>
                <p className="text-xs text-gray-500">Пул просроченных %</p>
                <p className="text-sm font-semibold text-red-400">{formatMoney(debt.overdue_interest_pool)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 ml-4" onClick={e => e.stopPropagation()}>
          {isOverduePayment && debt.status === 'active' && (
            <AlertTriangle
              size={16}
              className="text-yellow-400 mr-1"
              title={debt.debt_type === 'simple'
                ? 'Обязательный платёж за этот период ещё не внесён в полном объёме'
                : 'Текущие проценты периода ещё не покрыты внесёнными платежами'}
            />
          )}
          {onForecast && (
            <button
              onClick={e => { e.stopPropagation(); onForecast() }}
              className="text-xs text-gray-500 hover:text-yellow-400 px-2 py-1 rounded-lg border border-dark-500 hover:border-yellow-400 transition-all"
            >
              Прогноз
            </button>
          )}
          <button
            onClick={onToggleHidden}
            className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
            title={debt.is_hidden ? 'Показать' : 'Скрыть'}
          >
            {debt.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
            title="Редактировать"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
            title="Удалить"
          >
            <Trash2 size={14} />
          </button>
          <ChevronRight size={18} className="text-gray-500 ml-1" />
        </div>
      </div>
    </div>
  )
}
