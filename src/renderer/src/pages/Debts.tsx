import React, { useEffect, useState } from 'react'
import { Plus, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react'
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const d = await api.getDebts()
    setDebts(d as Debt[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const active = debts.filter(d => d.status === 'active')
  const closed = debts.filter(d => d.status === 'closed')
  const totalOwed = active.filter(d => d.direction === 'i_owe').reduce((s, d) => s + (d.initial_amount || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Долги</h1>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Добавить долг
        </button>
      </div>

      {/* Total */}
      <div className="card">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Общая долговая нагрузка</p>
        <p className="text-3xl font-bold text-red-400">{formatMoney(totalOwed)}</p>
        <p className="text-sm text-gray-500 mt-1">{active.filter(d => d.direction === 'i_owe').length} активных долга</p>
      </div>

      {/* Active debts */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {active.map(debt => (
            <DebtCard
              key={debt.id}
              debt={debt}
              onClick={() => onOpenDebt(debt.id)}
              onForecast={() => onOpenForecast(debt.id)}
            />
          ))}
          {active.length === 0 && (
            <div className="text-center py-10 text-gray-500">Нет активных долгов</div>
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
                <DebtCard key={debt.id} debt={debt} onClick={() => onOpenDebt(debt.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddDebtModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); load() }}
        />
      )}
    </div>
  )
}

function DebtCard({ debt, onClick, onForecast }: { debt: Debt; onClick: () => void; onForecast?: () => void }) {
  const isOverduePayment = debt.payment_day
    ? new Date() > new Date(new Date().getFullYear(), new Date().getMonth(), debt.payment_day)
    : false
  const nextDate = debt.payment_day ? nextPaymentDate(debt.payment_day) : null

  return (
    <div
      className="card cursor-pointer hover:border-yellow-400/30 transition-all"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold text-white">{debt.name}</h3>
            <span className={`badge ${
              debt.direction === 'i_owe'
                ? 'bg-red-900/40 text-red-400'
                : 'bg-green-900/40 text-green-400'
            }`}>
              {debt.direction === 'i_owe' ? 'Я должен' : 'Мне должны'}
            </span>
            {debt.debt_type === 'dad' && (
              <span className="badge bg-yellow-900/40 text-yellow-400">Папа</span>
            )}
            {debt.status === 'closed' && (
              <span className="badge bg-dark-600 text-gray-400">Закрыт</span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500">Сумма</p>
              <p className="text-xl font-bold text-white">{formatMoney(debt.initial_amount || 0)}</p>
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

        <div className="flex items-center gap-2 ml-4">
          {isOverduePayment && debt.status === 'active' && (
            <AlertTriangle size={16} className="text-yellow-400" />
          )}
          {onForecast && (
            <button
              onClick={e => { e.stopPropagation(); onForecast() }}
              className="text-xs text-gray-500 hover:text-yellow-400 px-2 py-1 rounded-lg border border-dark-500 hover:border-yellow-400 transition-all"
            >
              Прогноз
            </button>
          )}
          <ChevronRight size={18} className="text-gray-500" />
        </div>
      </div>
    </div>
  )
}
