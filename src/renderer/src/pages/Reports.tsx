import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { TrendingUp, Calendar, Wallet, FileSpreadsheet } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { MonthlyTotal, NetWorthPoint, Debt, RecurringOperation } from '../types'
import { formatMoney } from '../utils'

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: 'var(--c-dark-700)', border: '1px solid var(--c-dark-500)', borderRadius: '12px' },
  labelStyle: { color: 'var(--c-white)', fontWeight: 600 },
  itemStyle: { color: 'var(--c-gray-300)' },
}

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export default function Reports() {
  const api = useApi()
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([])
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [recurring, setRecurring] = useState<RecurringOperation[]>([])
  const [calMonth, setCalMonth] = useState(new Date())

  useEffect(() => {
    const now = new Date()
    const from = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28`
    api.getNetWorthHistory(12).then(d => setNetWorth(d as NetWorthPoint[]))
    api.getMonthlyTotals(from, to).then(d => setMonthly(d as MonthlyTotal[]))
    api.getDebtsWithDetails().then(d => setDebts(d as Debt[]))
    api.getRecurringOperations(true).then(d => setRecurring(d as RecurringOperation[]))
  }, [])

  function fmtMonth(m: string): string {
    const [, mm] = m.split('-')
    return MONTH_NAMES[parseInt(mm) - 1] ?? m
  }

  async function exportReport() {
    const now = new Date()
    const from = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28`
    await api.exportReportXlsx(from, to)
  }

  const monthlyData = monthly.map(m => ({ ...m, label: fmtMonth(m.month) }))
  const netWorthData = netWorth.map(n => ({ ...n, label: fmtMonth(n.month) }))

  // Сравнение текущего месяца с предыдущим и с тем же месяцем год назад
  const last = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const yearAgo = monthly.length >= 13 ? monthly[monthly.length - 13] : undefined

  // Средние по месяцам
  const avgIncome = monthly.length ? monthly.reduce((s, m) => s + m.income, 0) / monthly.length : 0
  const avgExpense = monthly.length ? monthly.reduce((s, m) => s + m.expense, 0) / monthly.length : 0

  // Календарь платежей на выбранный месяц
  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Пн = 0
  const paymentsByDay = new Map<number, Array<{ name: string; amount: number; kind: 'debt' | 'recurring' }>>()
  for (const d of debts) {
    if (d.status === 'active' && d.payment_day && !d.is_hidden && d.direction === 'i_owe') {
      const arr = paymentsByDay.get(d.payment_day) ?? []
      arr.push({ name: d.name, amount: d.monthly_payment ?? 0, kind: 'debt' })
      paymentsByDay.set(d.payment_day, arr)
    }
  }
  for (const r of recurring) {
    if (r.day_of_month) {
      const arr = paymentsByDay.get(r.day_of_month) ?? []
      arr.push({ name: r.category_name || r.comment || 'Операция', amount: r.amount, kind: 'recurring' })
      paymentsByDay.set(r.day_of_month, arr)
    }
  }

  function pct(cur: number, base: number): string {
    if (!base) return '—'
    const p = Math.round(((cur - base) / base) * 100)
    return `${p > 0 ? '+' : ''}${p}%`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Отчёты</h1>
        <button onClick={exportReport} className="btn-secondary flex items-center gap-2 text-sm">
          <FileSpreadsheet size={16} /> Экспорт в XLSX
        </button>
      </div>

      {/* Net worth */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={16} className="text-yellow-400" />
          <h2 className="text-base font-semibold text-white">Чистый капитал (активы − долги)</h2>
        </div>
        {netWorthData.length === 0 ? (
          <p className="text-gray-500 text-sm">Недостаточно данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={netWorthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-dark-600)" />
              <XAxis dataKey="label" stroke="var(--c-gray-500)" fontSize={12} />
              <YAxis stroke="var(--c-gray-500)" fontSize={12} tickFormatter={v => `${Math.round(v / 1000)}к`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v)} />
              <Legend />
              <Line type="monotone" dataKey="net_worth" name="Чистый капитал" stroke="#FFD600" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="wallet" name="Счета" stroke="#3B82F6" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="savings" name="Накопления" stroke="#22C55E" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="debts" name="Долги" stroke="#EF4444" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Monthly dynamics */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-yellow-400" />
          <h2 className="text-base font-semibold text-white">Доходы и расходы по месяцам</h2>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-dark-600)" />
            <XAxis dataKey="label" stroke="var(--c-gray-500)" fontSize={12} />
            <YAxis stroke="var(--c-gray-500)" fontSize={12} tickFormatter={v => `${Math.round(v / 1000)}к`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v)} />
            <Legend />
            <Bar dataKey="income" name="Доходы" fill="#22C55E" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Расходы" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparisons + averages */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h2 className="text-base font-semibold text-white mb-2">Сравнение</h2>
          {last ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Расходы {fmtMonth(last.month)}</span>
                <span className="text-white font-medium">{formatMoney(last.expense)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">к прошлому месяцу</span>
                <span className={prev && last.expense > prev.expense ? 'text-red-400' : 'text-green-400'}>{prev ? pct(last.expense, prev.expense) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">к тому же месяцу год назад</span>
                <span className={yearAgo && last.expense > yearAgo.expense ? 'text-red-400' : 'text-green-400'}>{yearAgo ? pct(last.expense, yearAgo.expense) : '—'}</span>
              </div>
            </>
          ) : <p className="text-gray-500 text-sm">Нет данных</p>}
        </div>
        <div className="card space-y-2">
          <h2 className="text-base font-semibold text-white mb-2">Средние за период</h2>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Средний доход/мес</span>
            <span className="text-green-400 font-medium">{formatMoney(avgIncome)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Средний расход/мес</span>
            <span className="text-red-400 font-medium">{formatMoney(avgExpense)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Средний баланс/мес</span>
            <span className="text-white font-medium">{formatMoney(avgIncome - avgExpense)}</span>
          </div>
        </div>
      </div>

      {/* Payment calendar */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-yellow-400" />
            <h2 className="text-base font-semibold text-white">Календарь платежей</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className="btn-secondary text-sm px-3 py-1">←</button>
            <span className="text-sm text-white w-32 text-center">{MONTH_NAMES[month]} {year}</span>
            <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="btn-secondary text-sm px-3 py-1">→</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DOW_SHORT.map(d => <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const payments = paymentsByDay.get(day)
            return (
              <div key={day} className={`min-h-[64px] rounded-lg border p-1 ${payments ? 'border-yellow-400/40 bg-yellow-400/5' : 'border-dark-600'}`}>
                <div className="text-xs text-gray-400">{day}</div>
                {payments?.map((p, idx) => (
                  <div key={idx} className={`text-[10px] truncate ${p.kind === 'debt' ? 'text-red-400' : 'text-blue-400'}`} title={`${p.name}: ${formatMoney(p.amount)}`}>
                    {p.name}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          <span className="text-red-400">Красным</span> — обязательные платежи по долгам, <span className="text-blue-400">синим</span> — регулярные операции.
        </p>
      </div>
    </div>
  )
}
