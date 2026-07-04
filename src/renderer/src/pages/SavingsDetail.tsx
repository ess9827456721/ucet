import React, { useEffect, useState } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SavingsAccount, SavingsTransaction } from '../types'
import { formatMoney, formatDate, today } from '../utils'

interface Props {
  accountId: number
  onBack: () => void
  onForecast: () => void
}

const TX_LABELS: Record<string, string> = { deposit: 'Пополнение', withdrawal: 'Снятие', interest: 'Проценты' }
const TX_COLORS: Record<string, string> = { deposit: 'text-green-400', withdrawal: 'text-red-400', interest: 'text-yellow-400' }

export default function SavingsDetail({ accountId, onBack, onForecast }: Props) {
  const api = useApi()
  const [account, setAccount] = useState<SavingsAccount | null>(null)
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [txFilter, setTxFilter] = useState<string>('all')
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(today())
  const [txComment, setTxComment] = useState('')
  const [txError, setTxError] = useState('')

  async function load() {
    setLoading(true)
    const [acc, txs] = await Promise.all([
      api.getSavingsAccount(accountId),
      api.getSavingsTransactions(accountId),
    ])
    setAccount(acc as SavingsAccount)
    setTransactions(txs as SavingsTransaction[])
    setLoading(false)
  }

  useEffect(() => { load() }, [accountId])

  async function handleApplyInterest() {
    await api.applyAccruedInterest(accountId)
    load()
  }

  async function handleTx(type: 'deposit' | 'withdrawal') {
    if (!txAmount || parseFloat(txAmount) <= 0) { setTxError('Укажите сумму'); return }
    try {
      if (type === 'deposit') await api.addSavingsDeposit(accountId, parseFloat(txAmount), txDate, txComment || undefined)
      else await api.addSavingsWithdrawal(accountId, parseFloat(txAmount), txDate, txComment || undefined)
      setShowDepositForm(false); setShowWithdrawForm(false)
      setTxAmount(''); setTxComment(''); setTxDate(today()); setTxError('')
      load()
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  if (loading || !account) return <div className="p-6 text-center text-gray-500">Загрузка...</div>

  const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
  const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
  const totalInterest = transactions.filter(t => t.type === 'interest').reduce((s, t) => s + t.amount, 0)
  const progress = account.goal_amount ? Math.min(1, account.balance / account.goal_amount) : null
  const filtered = txFilter === 'all' ? transactions : transactions.filter(t => t.type === txFilter)

  // Running balance (newest first, so compute from total)
  let runningBalance = account.balance + (account.accrued_interest ?? 0)
  const txsWithBalance = filtered.map(t => {
    const balAfter = runningBalance
    if (t.type === 'deposit' || t.type === 'interest') runningBalance -= t.amount
    else runningBalance += t.amount
    return { ...t, balanceAfter: balAfter }
  })

  const txForm = showDepositForm || showWithdrawForm
  const txType = showDepositForm ? 'deposit' : 'withdrawal'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-2 -ml-2"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: account.color }} />
            <h1 className="text-2xl font-bold text-white">{account.name}</h1>
            {account.goal_name && <span className="badge bg-yellow-900/40 text-yellow-400">{account.goal_name}</span>}
          </div>
        </div>
        <button onClick={onForecast} className="btn-secondary text-sm">Калькулятор</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Текущий баланс</p>
          <p className="text-2xl font-bold text-white">{formatMoney(account.balance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Ставка</p>
          <p className="text-2xl font-bold text-yellow-400">{(account.interest_rate * 100).toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">{account.interest_mode === 'capitalize' ? 'Капитализация' : 'Выплата'} · {account.payout_period === 'daily' ? 'ежедневно' : 'ежемесячно'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Начислено процентов</p>
          <p className="text-2xl font-bold text-orange-400">+{formatMoney(account.accrued_interest)}</p>
          <button onClick={handleApplyInterest} className="text-xs text-yellow-400 mt-1 hover:underline">Применить</button>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Всего пополнений</p>
          <p className="text-2xl font-bold text-green-400">{formatMoney(totalDeposits)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Всего снятий</p>
          <p className="text-2xl font-bold text-red-400">{formatMoney(totalWithdrawals)}</p>
        </div>
      </div>

      {/* Goal progress */}
      {account.goal_amount && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Прогресс к цели: {formatMoney(account.balance)} из {formatMoney(account.goal_amount)}</p>
            <p className="text-sm font-bold text-white">{Math.round((progress ?? 0) * 100)}%</p>
          </div>
          <div className="w-full bg-dark-600 rounded-full h-2.5">
            <div className="h-2.5 rounded-full bg-green-400 transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          {account.goal_date && (
            <p className="text-xs text-gray-500 mt-2">Дата цели: {formatDate(account.goal_date)}</p>
          )}
          {totalInterest > 0 && <p className="text-xs text-gray-500 mt-1">Всего начислено процентов: {formatMoney(totalInterest)}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => { setShowDepositForm(v => !v); setShowWithdrawForm(false); setTxError('') }} className="btn-primary flex items-center gap-2">
          <TrendingUp size={16} /> Пополнить
        </button>
        <button onClick={() => { setShowWithdrawForm(v => !v); setShowDepositForm(false); setTxError('') }} className="btn-secondary flex items-center gap-2">
          <TrendingDown size={16} /> Снять
        </button>
      </div>

      {txForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">{txType === 'deposit' ? 'Пополнение' : 'Снятие'}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Сумма, ₽</label><input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} className="input" autoFocus /></div>
            <div><label className="label">Дата</label><input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="input" /></div>
            <div><label className="label">Комментарий</label><input type="text" value={txComment} onChange={e => setTxComment(e.target.value)} className="input" /></div>
          </div>
          {txError && <p className="text-red-400 text-sm">{txError}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setShowDepositForm(false); setShowWithdrawForm(false); setTxError('') }} className="btn-secondary">Отмена</button>
            <button onClick={() => handleTx(txType)} className="btn-primary">{txType === 'deposit' ? 'Пополнить' : 'Снять'}</button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-base font-semibold">История транзакций</h2>
          <div className="flex gap-1">
            {(['all', 'deposit', 'withdrawal', 'interest'] as const).map(f => (
              <button key={f} onClick={() => setTxFilter(f)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${txFilter === f ? 'border-yellow-400 text-yellow-400' : 'border-dark-500 text-gray-400 hover:border-dark-400'}`}>
                {f === 'all' ? 'Все' : TX_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        {txsWithBalance.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">Нет транзакций</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Дата</th>
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Тип</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Сумма</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Баланс после</th>
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {txsWithBalance.map(t => (
                <tr key={t.id} className="border-b border-dark-700 hover:bg-dark-700">
                  <td className="px-5 py-3 text-sm text-gray-300">{formatDate(t.date)}</td>
                  <td className="px-5 py-3 text-sm"><span className={TX_COLORS[t.type]}>{TX_LABELS[t.type]}</span></td>
                  <td className={`px-5 py-3 text-sm text-right font-semibold ${TX_COLORS[t.type]}`}>
                    {t.type === 'withdrawal' ? '-' : '+'}{formatMoney(t.amount)}
                  </td>
                  <td className="px-5 py-3 text-sm text-right text-gray-300">{formatMoney(t.balanceAfter)}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{t.comment ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
