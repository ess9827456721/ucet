import React, { useEffect, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import { TrendingDown, TrendingUp, Wallet, Calendar } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Summary } from '../types'
import { formatMoney, getPeriodDates, formatDateShort } from '../utils'

const PERIODS = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
]

interface CategoryData {
  id: number
  name: string
  color: string
  total: number
}

interface DailyData {
  date: string
  expenses: number
  income: number
}

export default function Dashboard() {
  const api = useApi()
  const [period, setPeriod] = useState('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [daily, setDaily] = useState<DailyData[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = getPeriodDates(period)
    const [s, cats, d] = await Promise.all([
      api.getSummary(from, to),
      api.getExpensesByCategory(from, to),
      api.getDailyExpenses(from, to),
    ])
    setSummary(s as Summary)
    setCategories(cats as CategoryData[])
    setDaily(d as DailyData[])
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const topCategories = categories.slice(0, 5)
  const totalExpense = summary?.expense || 1

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Дашборд</h1>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Расходы"
          value={summary ? formatMoney(summary.expense) : '—'}
          icon={<TrendingDown className="text-red-400" size={20} />}
          valueClass="text-red-400"
        />
        <StatCard
          label="Доходы"
          value={summary ? formatMoney(summary.income) : '—'}
          icon={<TrendingUp className="text-green-400" size={20} />}
          valueClass="text-green-400"
        />
        <StatCard
          label="Остаток"
          value={summary ? formatMoney(summary.balance) : '—'}
          icon={<Wallet className="text-yellow-400" size={20} />}
          valueClass={summary && summary.balance >= 0 ? 'text-white' : 'text-red-400'}
        />
        <StatCard
          label="Средний расход/день"
          value={summary ? formatMoney(summary.avgPerDay) : '—'}
          icon={<Calendar className="text-blue-400" size={20} />}
          valueClass="text-white"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Donut chart */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Расходы по категориям</h2>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="total"
                  nameKey="name"
                >
                  {categories.map((cat, i) => (
                    <Cell key={i} fill={cat.color || '#FFD600'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatMoney(value)}
                  contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-500">Нет данных</div>
          )}
        </div>

        {/* Bar chart */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Динамика расходов</h2>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                <Tooltip
                  formatter={(value: number) => formatMoney(value)}
                  contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="expenses" fill="#EF4444" name="Расходы" radius={[4, 4, 0, 0]} />
                <Bar dataKey="income" fill="#22C55E" name="Доходы" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-500">Нет данных</div>
          )}
        </div>
      </div>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Топ-5 категорий</h2>
          <div className="space-y-3">
            {topCategories.map((cat, i) => {
              const pct = Math.round((cat.total / totalExpense) * 100)
              return (
                <div key={cat.id} className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color || '#FFD600' }}
                  />
                  <span className="flex-1 text-sm text-white">{cat.name}</span>
                  <span className="text-gray-400 text-sm">{pct}%</span>
                  <span className="text-white font-medium text-sm w-28 text-right">
                    {formatMoney(cat.total)}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Progress bars */}
          <div className="mt-4 space-y-2">
            {topCategories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 truncate">{cat.name}</span>
                <div className="flex-1 bg-dark-600 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.round((cat.total / totalExpense) * 100)}%`,
                      backgroundColor: cat.color || '#FFD600'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, valueClass }: {
  label: string; value: string; icon: React.ReactNode; valueClass: string
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}
