import React, { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SavingsAccount } from '../types'
import { formatMoney, formatDate, today } from '../utils'
import AddSavingsAccountModal from '../components/AddSavingsAccountModal'

interface Props {
  onOpenAccount: (id: number) => void
  onOpenForecast: (id: number) => void
}

interface PendingInterest { id: number; name: string; days: number; amount: number }
interface TransactionForm { accountId: number; type: 'deposit' | 'withdrawal'; name: string }

export default function Savings({ onOpenAccount, onOpenForecast }: Props) {
  const api = useApi()
  const [accounts, setAccounts] = useState<SavingsAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editAccount, setEditAccount] = useState<SavingsAccount | null>(null)
  const [focusGoal, setFocusGoal] = useState(false)
  const [pendingInterest, setPendingInterest] = useState<PendingInterest[]>([])
  const [txForm, setTxForm] = useState<TransactionForm | null>(null)
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(today())
  const [txComment, setTxComment] = useState('')
  const [txError, setTxError] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const orderRef = useRef<number[]>([])

  async function load() {
    setLoading(true)
    const [accs, pending] = await Promise.all([
      api.getSavingsAccounts(),
      api.getPendingSavingsInterest(),
    ])
    setAccounts(accs as SavingsAccount[])
    orderRef.current = (accs as SavingsAccount[]).map(a => a.id)
    setPendingInterest(pending as PendingInterest[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleApplyInterest(id: number) {
    await api.applyAccruedInterest(id)
    load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить счёт? Все транзакции будут потеряны.')) return
    await api.deleteSavingsAccount(id)
    load()
  }

  async function handleTx() {
    if (!txForm) return
    if (!txAmount || parseFloat(txAmount) <= 0) { setTxError('Укажите сумму'); return }
    try {
      if (txForm.type === 'deposit') {
        await api.addSavingsDeposit(txForm.accountId, parseFloat(txAmount), txDate, txComment || undefined)
      } else {
        await api.addSavingsWithdrawal(txForm.accountId, parseFloat(txAmount), txDate, txComment || undefined)
      }
      setTxForm(null); setTxAmount(''); setTxComment(''); setTxDate(today()); setTxError('')
      load()
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return
    const ids = [...orderRef.current]
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    orderRef.current = ids
    api.updateSavingsAccountsOrder(ids)
    setAccounts(prev => {
      const m = new Map(prev.map(a => [a.id, a]))
      return ids.map(id => m.get(id)!).filter(Boolean)
    })
    setDragId(null)
  }

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка...</div>

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalAccrued = accounts.reduce((s, a) => s + a.accrued_interest, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Накопления</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {accounts.length} счёт{accounts.length === 1 ? '' : accounts.length < 5 ? 'а' : 'ов'} ·{' '}
            {formatMoney(totalBalance)} баланс{' '}
            {totalAccrued > 0 && <span className="text-yellow-400">+ {formatMoney(totalAccrued)} начислено %</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setFocusGoal(true); setEditAccount(null); setShowModal(true) }} className="btn-secondary text-sm">
            + Добавить цель
          </button>
          <button onClick={() => { setFocusGoal(false); setEditAccount(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Открыть счёт
          </button>
        </div>
      </div>

      {/* Pending interest banner */}
      {pendingInterest.length > 0 && (
        <div className="card border-yellow-400/30 bg-yellow-400/5 space-y-2">
          <p className="text-sm font-medium text-yellow-400">Есть непроведённые начисления процентов:</p>
          {pendingInterest.map(p => (
            <div key={p.id} className="flex items-center justify-between">
              <p className="text-sm text-gray-300">{p.name} — за {p.days} дн.: <span className="text-white font-medium">{formatMoney(p.amount)}</span></p>
              <button onClick={() => handleApplyInterest(p.id)} className="btn-primary text-xs py-1 px-3">Применить</button>
            </div>
          ))}
        </div>
      )}

      {/* Transaction form */}
      {txForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">{txForm.type === 'deposit' ? 'Пополнить' : 'Снять'}: {txForm.name}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Сумма, ₽</label>
              <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} className="input" autoFocus />
            </div>
            <div>
              <label className="label">Дата</label>
              <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Комментарий</label>
              <input type="text" value={txComment} onChange={e => setTxComment(e.target.value)} className="input" />
            </div>
          </div>
          {txError && <p className="text-red-400 text-sm">{txError}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setTxForm(null); setTxError('') }} className="btn-secondary">Отмена</button>
            <button onClick={handleTx} className="btn-primary">{txForm.type === 'deposit' ? 'Пополнить' : 'Снять'}</button>
          </div>
        </div>
      )}

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">Нет активных накопительных счётов</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Открыть первый счёт →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => {
            const progress = acc.goal_amount ? Math.min(1, acc.balance / acc.goal_amount) : null
            const daysLeft = acc.goal_date ? Math.ceil((new Date(acc.goal_date + 'T00:00:00').getTime() - Date.now()) / 86400000) : null
            return (
              <div
                key={acc.id}
                className="card cursor-pointer hover:border-yellow-400/30 transition-all"
                draggable
                onDragStart={() => setDragId(acc.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(acc.id)}
                onClick={() => onOpenAccount(acc.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 mr-2 mt-1 text-gray-600 cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color }} />
                      <h3 className="text-base font-semibold text-white">{acc.name}</h3>
                      {acc.goal_name && (
                        <span className="badge bg-yellow-900/40 text-yellow-400">{acc.goal_name}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-6 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-500">Баланс</p>
                        <p className="text-xl font-bold text-white">{formatMoney(acc.balance)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Ставка</p>
                        <p className="text-sm font-semibold text-yellow-400">{(acc.interest_rate * 100).toFixed(2)}%</p>
                      </div>
                      {acc.accrued_interest > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">Начислено %</p>
                          <p className="text-sm font-semibold text-orange-400">+{formatMoney(acc.accrued_interest)}</p>
                        </div>
                      )}
                      {acc.goal_amount && (
                        <div className="flex-1 min-w-40">
                          <p className="text-xs text-gray-500 mb-1">
                            Цель: {formatMoney(acc.balance)} из {formatMoney(acc.goal_amount)}
                            {daysLeft !== null && daysLeft > 0 && <span className="ml-2 text-gray-600">· {daysLeft} дн.</span>}
                          </p>
                          <div className="w-full bg-dark-600 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-green-400 transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{Math.round((progress ?? 0) * 100)}%{acc.goal_date && ` · до ${formatDate(acc.goal_date)}`}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setTxForm({ accountId: acc.id, type: 'deposit', name: acc.name }); setTxAmount(''); setTxDate(today()); setTxComment('') }}
                      className="p-1.5 text-gray-500 hover:text-green-400 transition-colors" title="Пополнить"
                    >
                      <TrendingUp size={15} />
                    </button>
                    <button
                      onClick={() => { setTxForm({ accountId: acc.id, type: 'withdrawal', name: acc.name }); setTxAmount(''); setTxDate(today()); setTxComment('') }}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Снять"
                    >
                      <TrendingDown size={15} />
                    </button>
                    <button onClick={() => onOpenForecast(acc.id)} className="text-xs text-gray-500 hover:text-yellow-400 px-2 py-1 rounded-lg border border-dark-500 hover:border-yellow-400 transition-all">
                      Прогноз
                    </button>
                    <button onClick={() => { setEditAccount(acc); setShowModal(true) }} className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(acc.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                    <ArrowRight size={14} className="text-gray-600 ml-1" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <AddSavingsAccountModal
          editAccount={editAccount}
          focusGoal={focusGoal}
          onClose={() => { setShowModal(false); setEditAccount(null) }}
          onSaved={() => { setShowModal(false); setEditAccount(null); load() }}
        />
      )}
    </div>
  )
}
