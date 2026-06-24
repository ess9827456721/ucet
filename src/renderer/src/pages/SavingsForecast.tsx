import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SavingsAccount } from '../types'
import { formatMoney, formatDate } from '../utils'

interface Props {
  accountId: number
  onBack: () => void
}

interface ForecastRow {
  month: number
  contribution: number
  interest: number
  balance: number
  progress: number | null
}

export default function SavingsForecast({ accountId, onBack }: Props) {
  const api = useApi()
  const [account, setAccount] = useState<SavingsAccount | null>(null)
  const [monthly, setMonthly] = useState('')
  const [months, setMonths] = useState('24')
  const [forecast, setForecast] = useState<ForecastRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getSavingsAccount(accountId).then(a => setAccount(a as SavingsAccount))
  }, [accountId])

  async function calcForecast() {
    setLoading(true)
    const rows = await api.getSavingsForecast(accountId, parseFloat(monthly) || 0, parseInt(months) || 24)
    setForecast(rows as ForecastRow[])
    setLoading(false)
  }

  const goalReachedAt = account?.goal_amount
    ? forecast.find(r => r.balance >= account.goal_amount!)
    : null

  const monthLabel = (m: number) => {
    const d = new Date()
    d.setMonth(d.getMonth() + m)
    return `${d.toLocaleString('ru', { month: 'short' })} ${d.getFullYear()}`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-2 -ml-2"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-white">Калькулятор накоплений</h1>
          {account && <p className="text-sm text-gray-500">{account.name}</p>}
        </div>
      </div>

      {account && (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Текущий баланс</p><p className="font-semibold text-white">{formatMoney(account.balance + account.accrued_interest)}</p></div>
            <div><p className="text-gray-500">Ставка</p><p className="font-semibold text-yellow-400">{(account.interest_rate * 100).toFixed(2)}%</p></div>
            <div><p className="text-gray-500">Режим</p><p className="font-semibold text-gray-300">{account.interest_mode === 'capitalize' ? 'Капитализация' : 'Выплата'}</p></div>
            {account.goal_amount && <div><p className="text-gray-500">Цель</p><p className="font-semibold text-green-400">{formatMoney(account.goal_amount)}</p></div>}
          </div>

          <div className="flex gap-3 items-end">
            <div>
              <label className="label">Пополнение в месяц, ₽</label>
              <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="0" className="input w-40" />
            </div>
            <div>
              <label className="label">Горизонт, месяцев</label>
              <input type="number" value={months} onChange={e => setMonths(e.target.value)} className="input w-28" />
            </div>
            <button onClick={calcForecast} disabled={loading} className="btn-primary">Рассчитать</button>
          </div>

          {goalReachedAt && account.goal_amount && (
            <div className="bg-green-900/20 border border-green-400/30 rounded-lg px-4 py-2 text-sm text-green-400">
              Цель {formatMoney(account.goal_amount)} будет достигнута на месяц {goalReachedAt.month} ({monthLabel(goalReachedAt.month)})
            </div>
          )}
          {forecast.length > 0 && account.goal_amount && !goalReachedAt && (
            <div className="bg-yellow-900/20 border border-yellow-400/30 rounded-lg px-4 py-2 text-sm text-yellow-400">
              При таком темпе цель не будет достигнута за {months} месяцев
            </div>
          )}
        </div>
      )}

      {forecast.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Месяц</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Пополнение</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Проценты</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Баланс</th>
                {account?.goal_amount && <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Прогресс</th>}
              </tr>
            </thead>
            <tbody>
              {forecast.map(r => {
                const isGoal = account?.goal_amount && r.balance >= account.goal_amount
                return (
                  <tr key={r.month} className={`border-b border-dark-700 hover:bg-dark-700 ${isGoal ? 'bg-green-900/10' : ''}`}>
                    <td className="px-5 py-2 text-gray-300">{r.month}. {monthLabel(r.month)}</td>
                    <td className="px-5 py-2 text-right text-green-400">{r.contribution > 0 ? '+' + formatMoney(r.contribution) : '—'}</td>
                    <td className="px-5 py-2 text-right text-yellow-400">+{formatMoney(r.interest)}</td>
                    <td className="px-5 py-2 text-right font-semibold text-white">{formatMoney(r.balance)}</td>
                    {account?.goal_amount && (
                      <td className="px-5 py-2 text-right text-gray-400">
                        {r.progress !== null ? Math.min(100, Math.round(r.progress * 100)) + '%' : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
