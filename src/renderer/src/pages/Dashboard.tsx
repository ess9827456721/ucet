import React, { useEffect, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { TrendingDown, TrendingUp, Wallet, Calendar, CreditCard } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Summary, Debt, Operation } from '../types'
import { formatMoney, getPeriodDates, formatDateShort, today, monthStart, monthEnd } from '../utils'

interface CategoryData { id: number; name: string; color: string; total: number }
interface DailyData { date: string; expenses: number; income: number }
interface MonthlyData { month: string; daily: number; big: number; apartment: number }
interface DowData { dow: number; total: number; count: number }
interface CashFlowData { dailyBudget: number; journal: Array<{ date: string; dayExpenses: number; cumLimit: number; saldo: number }> }

const PRESETS = [
  { id: 'week', label: 'Нед' },
  { id: 'month', label: 'Мес' },
  { id: 'quarter', label: 'Кв' },
  { id: 'year', label: 'Год' },
]

const DOW_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const EXPENSE_TYPES = [
  { id: '', label: 'Все' },
  { id: 'daily', label: 'Повседн.' },
  { id: 'big', label: 'Крупные' },
  { id: 'apartment', label: 'Квартира' },
]

function subtractPeriod(from: string, to: string): { from: string; to: string } {
  const d1 = new Date(from + 'T00:00:00')
  const d2 = new Date(to + 'T00:00:00')
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
  const prev2 = new Date(d1)
  prev2.setDate(prev2.getDate() - 1)
  const prev1 = new Date(prev2)
  prev1.setDate(prev1.getDate() - (days - 1))
  return {
    from: prev1.toISOString().slice(0, 10),
    to: prev2.toISOString().slice(0, 10),
  }
}

export default function Dashboard() {
  const api = useApi()

  const initFrom = monthStart(new Date().getFullYear(), new Date().getMonth() + 1)
  const initTo = monthEnd(new Date().getFullYear(), new Date().getMonth() + 1)
  const [dateFrom, setDateFrom] = useState(initFrom)
  const [dateTo, setDateTo] = useState(initTo)
  const [expenseTypeFilter, setExpenseTypeFilter] = useState('')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [daily, setDaily] = useState<DailyData[]>([])
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [dowData, setDowData] = useState<DowData[]>([])
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null)
  const [activeDebts, setActiveDebts] = useState<Debt[]>([])
  const [drillCategory, setDrillCategory] = useState<CategoryData | null>(null)
  const [drillOps, setDrillOps] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)

  const periodDays = Math.round((new Date(dateTo + 'T00:00:00').getTime() - new Date(dateFrom + 'T00:00:00').getTime()) / 86400000) + 1

  const load = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const et = expenseTypeFilter || undefined
    const prev = subtractPeriod(dateFrom, dateTo)
    const [s, prevS, cats, d, mo, dow, debts] = await Promise.all([
      api.getSummary(dateFrom, dateTo, et),
      api.getSummary(prev.from, prev.to, et),
      api.getExpensesByCategory(dateFrom, dateTo, et),
      api.getDailyExpenses(dateFrom, dateTo, et),
      api.getMonthlyExpenses(dateFrom, dateTo),
      api.getExpensesByDayOfWeek(dateFrom, dateTo),
      api.getDebtsWithBalance(),
    ])
    setSummary(s as Summary)
    setPrevSummary(prevS as Summary)
    setCategories(cats as CategoryData[])
    setDaily(d as DailyData[])
    setMonthly(mo as MonthlyData[])
    setDowData(dow as DowData[])
    setActiveDebts(debts as Debt[])

    const cf = await api.getCashFlow(now.getFullYear(), now.getMonth() + 1)
    setCashFlow(cf as CashFlowData)
    setLoading(false)
  }, [dateFrom, dateTo, expenseTypeFilter])

  useEffect(() => { load() }, [load])

  function applyPreset(id: string) {
    const { from, to } = getPeriodDates(id)
    setDateFrom(from)
    setDateTo(to)
  }

  async function openDrill(cat: CategoryData) {
    setDrillCategory(cat)
    const ops = await api.getOperations({ dateFrom, dateTo, categoryId: cat.id })
    setDrillOps(ops as Operation[])
  }

  const topCategories = categories.slice(0, 5)
  const totalExpense = summary?.expense || 1
  const showMonthly = periodDays > 45

  const todayStr = today()
  const todayExpenses = daily.find(d => d.date === todayStr)?.expenses ?? 0
  const cfJournal = cashFlow?.journal ?? []
  const lastSaldo = cfJournal.length > 0 ? cfJournal[cfJournal.length - 1].saldo : null

  const totalDebtOwed = activeDebts.filter(d => d.direction === 'i_owe').reduce((s, d) => s + (d.current_balance ?? d.initial_amount ?? 0), 0)

  const dowRows = Array.from({ length: 7 }, (_, i) => {
    const found = dowData.find(d => d.dow === i)
    return { dow: i, total: found?.total ?? 0, count: found?.count ?? 0 }
  })
  const maxDow = Math.max(...dowRows.map(r => r.total), 1)

  return (
    <div className="p-6 space-y-6">
      {/* Header + date range */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white flex-shrink-0">Дашборд</h1>
        <div className="flex gap-1 bg-dark-800 rounded-xl p-1 border border-dark-600">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-gray-400 hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input py-1.5 text-sm w-36" />
          <span className="text-gray-500 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input py-1.5 text-sm w-36" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Загрузка...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Расходы"
              value={summary ? formatMoney(summary.expense) : '—'}
              icon={<TrendingDown className="text-red-400" size={20} />}
              valueClass="text-red-400"
              sub={prevSummary && prevSummary.expense > 0 ? (() => {
                const pct = Math.round(((summary!.expense - prevSummary.expense) / prevSummary.expense) * 100)
                return <span className={pct > 0 ? 'text-red-400' : 'text-green-400'}>{pct > 0 ? '+' : ''}{pct}% к пред. пер.</span>
              })() : null}
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

          {/* Daily budget + Debt widget */}
          <div className="grid grid-cols-2 gap-4">
            {cashFlow && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={16} className="text-yellow-400" />
                  <h2 className="text-sm font-semibold text-white">Бюджет на сегодня</h2>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Лимит / день</p>
                    <p className="text-lg font-bold text-white">{formatMoney(cashFlow.dailyBudget)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Потрачено сегодня</p>
                    <p className={`text-lg font-bold ${todayExpenses > cashFlow.dailyBudget ? 'text-red-400' : 'text-green-400'}`}>
                      {formatMoney(todayExpenses)}
                    </p>
                  </div>
                </div>
                <div className="w-full bg-dark-600 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all ${todayExpenses > cashFlow.dailyBudget ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, Math.round((todayExpenses / Math.max(cashFlow.dailyBudget, 1)) * 100))}%` }}
                  />
                </div>
                {lastSaldo !== null && (
                  <p className={`text-xs mt-2 ${lastSaldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    Сальдо месяца: {lastSaldo >= 0 ? '+' : ''}{formatMoney(lastSaldo)} — {lastSaldo >= 0 ? 'В норме' : 'Превышение'}
                  </p>
                )}
              </div>
            )}

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={16} className="text-red-400" />
                <h2 className="text-sm font-semibold text-white">Долговая нагрузка</h2>
              </div>
              {activeDebts.length === 0 ? (
                <p className="text-gray-500 text-sm">Нет активных долгов</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-red-400 mb-2">{formatMoney(totalDebtOwed)}</p>
                  <div className="space-y-1">
                    {activeDebts.slice(0, 3).map(d => (
                      <div key={d.id} className="flex justify-between text-xs">
                        <span className="text-gray-400 truncate max-w-[60%]">{d.name}</span>
                        <span className="text-white font-medium">{formatMoney(d.current_balance ?? d.initial_amount ?? 0)}</span>
                      </div>
                    ))}
                    {activeDebts.length > 3 && (
                      <p className="text-xs text-gray-500">+{activeDebts.length - 3} ещё</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Expense type filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Тип расхода:</span>
            <div className="flex gap-1 bg-dark-800 rounded-xl p-1 border border-dark-600">
              {EXPENSE_TYPES.map(et => (
                <button
                  key={et.id}
                  onClick={() => setExpenseTypeFilter(et.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    expenseTypeFilter === et.id ? 'bg-yellow-400 text-dark-900' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Donut chart with drill-down */}
            <div className="card">
              <h2 className="text-base font-semibold mb-1">Расходы по категориям</h2>
              <p className="text-xs text-gray-500 mb-3">Нажмите на сегмент для просмотра операций</p>
              {categories.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categories}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="total"
                      nameKey="name"
                      onClick={(data) => openDrill(data as CategoryData)}
                      className="cursor-pointer"
                    >
                      {categories.map((cat, i) => (
                        <Cell key={i} fill={cat.color || '#FFD600'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                      contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                      labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                      itemStyle={{ color: '#E5E5E5' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-56 flex items-center justify-center text-gray-500">Нет данных</div>
              )}
            </div>

            {/* Bar chart — daily */}
            <div className="card">
              <h2 className="text-base font-semibold mb-4">Динамика расходов</h2>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={daily} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                    <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                      contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                      labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                      itemStyle={{ color: '#E5E5E5' }}
                    />
                    <Bar dataKey="expenses" fill="#EF4444" name="Расходы" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="income" fill="#22C55E" name="Доходы" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-56 flex items-center justify-center text-gray-500">Нет данных</div>
              )}
            </div>
          </div>

          {/* Monthly chart */}
          {showMonthly && monthly.length > 1 && (
            <div className="card">
              <h2 className="text-base font-semibold mb-4">Расходы по месяцам</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value)}
                    contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                    itemStyle={{ color: '#E5E5E5' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                  <Bar dataKey="daily" stackId="a" fill="#FFD600" name="Повседневные" />
                  <Bar dataKey="big" stackId="a" fill="#F97316" name="Крупные" />
                  <Bar dataKey="apartment" stackId="a" fill="#3B82F6" name="Квартира" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Day-of-week breakdown */}
          {dowData.length > 0 && (
            <div className="card">
              <h2 className="text-base font-semibold mb-4">Расходы по дням недели</h2>
              <div className="space-y-2">
                {dowRows.map(row => {
                  const isWeekend = row.dow === 0 || row.dow === 6
                  return (
                    <div key={row.dow} className="flex items-center gap-3">
                      <span className={`text-xs w-6 font-medium ${isWeekend ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {DOW_NAMES[row.dow]}
                      </span>
                      <div className="flex-1 bg-dark-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${isWeekend ? 'bg-yellow-400' : 'bg-blue-500'}`}
                          style={{ width: `${Math.round((row.total / maxDow) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-white w-28 text-right">{row.total > 0 ? formatMoney(row.total) : '—'}</span>
                      <span className="text-xs text-gray-500 w-16 text-right">{row.count > 0 ? `${row.count} оп.` : ''}</span>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const weekdayTotal = dowRows.filter(r => r.dow >= 1 && r.dow <= 5).reduce((s, r) => s + r.total, 0)
                const weekendTotal = dowRows.filter(r => r.dow === 0 || r.dow === 6).reduce((s, r) => s + r.total, 0)
                const total = weekdayTotal + weekendTotal
                if (total === 0) return null
                return (
                  <div className="mt-3 pt-3 border-t border-dark-600 flex gap-6 text-xs text-gray-400">
                    <span>Будни: <b className="text-white">{formatMoney(weekdayTotal)}</b> ({Math.round((weekdayTotal / total) * 100)}%)</span>
                    <span>Выходные: <b className="text-yellow-400">{formatMoney(weekendTotal)}</b> ({Math.round((weekendTotal / total) * 100)}%)</span>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Top categories */}
          {topCategories.length > 0 && (
            <div className="card">
              <h2 className="text-base font-semibold mb-4">Топ-5 категорий</h2>
              <div className="space-y-3">
                {topCategories.map((cat, i) => {
                  const pct = Math.round((cat.total / totalExpense) * 100)
                  return (
                    <div key={cat.id} className="flex items-center gap-3 cursor-pointer hover:opacity-80" onClick={() => openDrill(cat)}>
                      <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#FFD600' }} />
                      <span className="flex-1 text-sm text-white">{cat.name}</span>
                      <span className="text-gray-400 text-sm">{pct}%</span>
                      <span className="text-white font-medium text-sm w-28 text-right">{formatMoney(cat.total)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 space-y-2">
                {topCategories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 truncate">{cat.name}</span>
                    <div className="flex-1 bg-dark-600 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${Math.round((cat.total / totalExpense) * 100)}%`, backgroundColor: cat.color || '#FFD600' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Drill-down modal */}
      {drillCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDrillCategory(null)}>
          <div className="bg-dark-800 rounded-3xl w-full max-w-lg mx-4 shadow-2xl border border-dark-500 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-dark-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: drillCategory.color }} />
                <h2 className="text-base font-semibold text-white">{drillCategory.name}</h2>
                <span className="text-gray-400 text-sm">{formatMoney(drillCategory.total)}</span>
              </div>
              <button onClick={() => setDrillCategory(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto scrollbar-thin">
              {drillOps.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Нет операций</p>
              ) : drillOps.map(op => (
                <div key={op.id} className="flex items-center justify-between px-6 py-3 border-b border-dark-700">
                  <div>
                    <p className="text-sm text-white">{op.date}</p>
                    {op.subcategory_name && <p className="text-xs text-gray-500">{op.subcategory_name}</p>}
                    {op.comment && <p className="text-xs text-gray-400">{op.comment}</p>}
                  </div>
                  <p className="text-sm font-semibold text-red-400">−{formatMoney(op.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, valueClass, sub }: {
  label: string; value: string; icon: React.ReactNode; valueClass: string; sub?: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs mt-1">{sub}</div>}
    </div>
  )
}
