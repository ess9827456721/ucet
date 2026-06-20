import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useApi } from '../hooks/useApi'
import { Debt, DadPayment, SimpleDebtPayment } from '../types'
import { formatMoney, formatDate } from '../utils'

interface Props {
  debtId: number
  onBack: () => void
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' },
  labelStyle: { color: '#FFFFFF', fontWeight: 600 },
  itemStyle: { color: '#E5E5E5' },
}

export default function DebtAnalytics({ debtId, onBack }: Props) {
  const api = useApi()
  const [debt, setDebt] = useState<Debt | null>(null)
  const [dadPayments, setDadPayments] = useState<DadPayment[]>([])
  const [simplePayments, setSimplePayments] = useState<SimpleDebtPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const d = await api.getDebt(debtId) as Debt
      setDebt(d)
      if (d.debt_type === 'dad') {
        const ph = await api.getDadPaymentHistory(debtId)
        setDadPayments(ph as DadPayment[])
      } else {
        const ph = await api.getSimpleDebtPayments(debtId)
        setSimplePayments(ph as SimpleDebtPayment[])
      }
      setLoading(false)
    }
    load()
  }, [debtId])

  if (loading || !debt) {
    return <div className="p-6 text-center text-gray-500">Загрузка...</div>
  }

  const isDad = debt.debt_type === 'dad'

  // Build balance-over-time data (reverse chronological → sort ascending)
  const balanceHistory: Array<{ date: string; balance: number; totalPaid: number }> = []
  if (isDad) {
    const sorted = [...dadPayments].sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    let cumulativePaid = 0
    sorted.forEach(p => {
      cumulativePaid += p.body_covered
      balanceHistory.push({ date: p.payment_date, balance: 0, totalPaid: cumulativePaid })
    })
  } else {
    const sorted = [...simplePayments].sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    let remaining = debt.initial_amount || 0
    sorted.forEach(p => {
      remaining -= p.body_part
      balanceHistory.push({ date: p.payment_date, balance: Math.max(0, remaining), totalPaid: (debt.initial_amount || 0) - Math.max(0, remaining) })
    })
  }

  // Payment structure data for bar chart
  const paymentStructure = isDad
    ? dadPayments.slice().reverse().map(p => ({
        date: formatDate(p.payment_date),
        body: p.body_covered,
        interest: p.interest_covered,
        pool: p.pool_covered,
      }))
    : simplePayments.slice().reverse().map(p => ({
        date: formatDate(p.payment_date),
        body: p.body_part,
        interest: p.interest_part,
        pool: 0,
      }))

  // Summary metrics
  const totalPaid = isDad
    ? dadPayments.reduce((s, p) => s + p.total_amount, 0)
    : simplePayments.reduce((s, p) => s + p.total_amount, 0)
  const totalBodyPaid = isDad
    ? dadPayments.reduce((s, p) => s + p.body_covered, 0)
    : simplePayments.reduce((s, p) => s + p.body_part, 0)
  const totalInterestPaid = isDad
    ? dadPayments.reduce((s, p) => s + p.interest_covered + p.pool_covered, 0)
    : simplePayments.reduce((s, p) => s + p.interest_part, 0)
  const overpaymentPct = totalBodyPaid > 0 ? Math.round((totalInterestPaid / totalBodyPaid) * 100) : 0

  const pieData = [
    { name: 'Тело долга', value: totalBodyPaid, color: '#22C55E' },
    { name: 'Проценты', value: totalInterestPaid, color: '#EF4444' },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-2 -ml-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Аналитика: {debt.name}</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Всего выплачено</p>
          <p className="text-xl font-bold text-white">{formatMoney(totalPaid)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Погашено тела</p>
          <p className="text-xl font-bold text-green-400">{formatMoney(totalBodyPaid)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Уплачено процентов</p>
          <p className="text-xl font-bold text-red-400">{formatMoney(totalInterestPaid)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Переплата</p>
          <p className="text-xl font-bold text-yellow-400">{overpaymentPct}%</p>
        </div>
      </div>

      {balanceHistory.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">Нет истории платежей</div>
      ) : (
        <>
          {/* Balance over time */}
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Динамика погашения тела</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={balanceHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip formatter={(v: number) => formatMoney(v)} {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                <Area dataKey="totalPaid" name="Погашено тела" stroke="#22C55E" fill="#22C55E33" />
                {!isDad && <Area dataKey="balance" name="Остаток" stroke="#EF4444" fill="#EF444433" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Payment structure */}
          <div className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-base font-semibold mb-4">Структура платежей</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentStructure}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                  <Bar dataKey="body" stackId="a" fill="#22C55E" name="Тело" />
                  <Bar dataKey="interest" stackId="a" fill="#EF4444" name="Проценты" />
                  {isDad && <Bar dataKey="pool" stackId="a" fill="#F97316" name="Пул %" radius={[4, 4, 0, 0]} />}
                  {!isDad && <Bar dataKey="interest" stackId="a" fill="#EF4444" name="Проценты" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card flex flex-col items-center justify-center">
              <h2 className="text-base font-semibold mb-4 self-start">Тело vs Проценты</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-sm">Нет данных</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
