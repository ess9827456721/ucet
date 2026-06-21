import React, { useEffect, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
// Legend is used in monthly/daily charts
import { TrendingDown, TrendingUp, Wallet, Calendar, CreditCard, Maximize2, X, List, Target, Plus, Pencil, Trash2, Bell } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Summary, Debt, Operation, SavingsGoal } from '../types'
import { formatMoney, getPeriodDates, formatDateShort, today, monthStart, monthEnd } from '../utils'
import InfoTooltip from '../components/InfoTooltip'
import AddGoalModal from '../components/AddGoalModal'

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

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' },
  labelStyle: { color: '#FFFFFF', fontWeight: 600 },
  itemStyle: { color: '#E5E5E5' },
}

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

function ExpandModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-800 rounded-3xl w-full max-w-4xl mx-4 shadow-2xl border border-dark-500 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-dark-600">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
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
  const [bigBreakdown, setBigBreakdown] = useState<{ id: number; label: string; amount: number }[]>([])
  const [daily, setDaily] = useState<DailyData[]>([])
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [dowData, setDowData] = useState<DowData[]>([])
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null)
  const [activeDebts, setActiveDebts] = useState<Debt[]>([])
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [pendingRecurring, setPendingRecurring] = useState<{ id: number; name: string; amount: number; category?: string }[]>([])
  const [drillCategory, setDrillCategory] = useState<CategoryData | null>(null)
  const [drillOps, setDrillOps] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [goalModal, setGoalModal] = useState<{ edit?: SavingsGoal } | null>(null)
  const [showDebtOpsInChart, setShowDebtOpsInChart] = useState(false)
  const [showDebtInAvg, setShowDebtInAvg] = useState(false)

  const periodDays = Math.round((new Date(dateTo + 'T00:00:00').getTime() - new Date(dateFrom + 'T00:00:00').getTime()) / 86400000) + 1

  const load = useCallback(async () => {
    setLoading(true)
    const now = new Date()
    const et = expenseTypeFilter || undefined
    const prev = subtractPeriod(dateFrom, dateTo)
    const [s, prevS, cats, d, mo, dow, debts, g] = await Promise.all([
      api.getSummary(dateFrom, dateTo, et),
      api.getSummary(prev.from, prev.to, et),
      api.getExpensesByCategory(dateFrom, dateTo, et),
      api.getDailyExpenses(dateFrom, dateTo, et),
      api.getMonthlyExpenses(dateFrom, dateTo),
      api.getExpensesByDayOfWeek(dateFrom, dateTo),
      api.getDebtsWithDetails(),
      api.getSavingsGoals(),
    ])
    setSummary(s as Summary)
    setPrevSummary(prevS as Summary)
    setCategories(cats as CategoryData[])
    if (et === 'big') {
      const big = await api.getBigExpensesBreakdown(dateFrom, dateTo)
      setBigBreakdown(big as { id: number; label: string; amount: number }[])
    } else {
      setBigBreakdown([])
    }
    setDaily(d as DailyData[])
    setMonthly(mo as MonthlyData[])
    setDowData(dow as DowData[])
    setActiveDebts(debts as Debt[])
    setGoals(g as SavingsGoal[])

    const [cf, pending] = await Promise.all([
      api.getCashFlow(now.getFullYear(), now.getMonth() + 1),
      api.getPendingRecurringOperations(),
    ])
    setCashFlow(cf as CashFlowData)
    setPendingRecurring(pending as { id: number; name: string; amount: number; category?: string }[])
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
    let ops: unknown[]
    if (cat.id === -2) {
      ops = await api.getOperations({ dateFrom, dateTo, type: 'debt_op' })
    } else if (cat.id === -1) {
      ops = await api.getOperations({ dateFrom, dateTo, noCategory: true })
    } else {
      ops = await api.getOperations({ dateFrom, dateTo, categoryId: cat.id })
    }
    setDrillOps(ops as Operation[])
  }

  const topCategories = categories.slice(0, 5)
  const totalExpense = summary?.expense || 1
  const showMonthly = periodDays > 45

  const todayStr = today()
  const todayExpenses = daily.find(d => d.date === todayStr)?.expenses ?? 0
  const cfJournal = cashFlow?.journal ?? []
  const lastSaldo = cfJournal.find(r => r.date === todayStr)?.saldo ?? null

  const nowDay = new Date().getDate()
  const upcomingDebts = activeDebts.filter(d => {
    if (d.status !== 'active' || !d.payment_day || d.is_hidden) return false
    const daysUntil = d.payment_day >= nowDay ? d.payment_day - nowDay : 0
    if (daysUntil > 7) return false
    // Skip if payment was already made this month
    if (d.last_payment_date) {
      const lp = new Date(d.last_payment_date + 'T00:00:00')
      const now = new Date()
      if (lp.getFullYear() === now.getFullYear() && lp.getMonth() === now.getMonth()) return false
    }
    return true
  })

  const debtOwed = activeDebts.filter(d => d.direction === 'i_owe' && !d.is_hidden)
  const totalDebtOwed = debtOwed.reduce((s, d) => s + (d.current_balance ?? d.initial_amount ?? 0), 0)
  const totalAccrued = debtOwed.reduce((s, d) => s + (d.accrued_interest ?? 0), 0)
  const totalMonthlyPayment = debtOwed.reduce((s, d) => s + (d.monthly_payment ?? 0), 0)

  const dowRows = Array.from({ length: 7 }, (_, i) => {
    const found = dowData.find(d => d.dow === i)
    return { dow: i, total: found?.total ?? 0, count: found?.count ?? 0 }
  })
  const maxDow = Math.max(...dowRows.map(r => r.total), 1)

  const RADIAN = Math.PI / 180

  function makeRadialLabel(outerRadius: number, threshold: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ cx, cy, midAngle, name, value, percent }: any) => {
      if ((percent as number) < threshold) return null
      const cos = Math.cos(-midAngle * RADIAN)
      const sin = Math.sin(-midAngle * RADIAN)
      const r1 = outerRadius + 8
      const r2 = outerRadius + 28
      const x1 = cx + r1 * cos
      const y1 = cy + r1 * sin
      const x2 = cx + r2 * cos
      const y2 = cy + r2 * sin
      const isRight = cos >= 0
      const xText = isRight ? x2 + 6 : x2 - 6
      const anchor = isRight ? 'start' : 'end'
      const pct = ((percent as number) * 100).toFixed(1)
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4B5563" strokeWidth={1} />
          <line x1={x2} y1={y2} x2={isRight ? x2 + 12 : x2 - 12} y2={y2} stroke="#4B5563" strokeWidth={1} />
          <text x={xText} y={y2 - 4} textAnchor={anchor} fill="#E5E5E5" fontSize={10} fontWeight={500}>{name}</text>
          <text x={xText} y={y2 + 8} textAnchor={anchor} fill="#9CA3AF" fontSize={9}>
            {formatMoney(value as number)} · {pct}%
          </text>
        </g>
      )
    }
  }

  // Deterministic color palette for big expenses (no category color available)
  const BIG_COLORS = ['#F59E0B','#EF4444','#8B5CF6','#06B6D4','#10B981','#F97316','#EC4899','#6366F1','#84CC16','#14B8A6']

  const DonutChart = ({ outerRadius = 105, innerRadius = 65, height = 280, threshold = 0.03 }: {
    outerRadius?: number; innerRadius?: number; height?: number; threshold?: number
  }) => {
    if (expenseTypeFilter === 'big') {
      if (bigBreakdown.length === 0) return <div className="flex items-center justify-center text-gray-500" style={{ height }}>Нет данных</div>
      const bigTotal = bigBreakdown.reduce((s, r) => s + r.amount, 0)
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={bigBreakdown}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              dataKey="amount"
              nameKey="label"
              label={makeRadialLabel(outerRadius, threshold)}
              labelLine={false}
            >
              {bigBreakdown.map((r, i) => (
                <Cell key={r.id} fill={BIG_COLORS[i % BIG_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [formatMoney(value), `${((value / bigTotal) * 100).toFixed(1)}%`]} {...TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      )
    }
    const debtOpsAmount = showDebtOpsInChart && summary?.debtOps ? summary.debtOps : 0
    const debtSegment = debtOpsAmount > 0 ? [{ id: -2, name: 'Платежи по долгам', color: '#6366F1', total: debtOpsAmount }] : []
    const chartData = [...categories, ...debtSegment]
    return chartData.length > 0 ? (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="total"
            nameKey="name"
            onClick={(data) => {
              const d = data as CategoryData
              if (d.id === -2) {
                openDrill({ ...d, id: -2 })
              } else {
                openDrill(d)
              }
            }}
            className="cursor-pointer"
            label={makeRadialLabel(outerRadius, threshold)}
            labelLine={false}
          >
            {chartData.map((cat, i) => (
              <Cell key={i} fill={cat.color || '#FFD600'} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => formatMoney(value)} {...TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    ) : (
      <div className="flex items-center justify-center text-gray-500" style={{ height }}>Нет данных</div>
    )
  }

  const DailyChart = ({ height = 220 }: { height?: number }) => (
    daily.length > 0 ? (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={daily} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
          <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
          <Tooltip formatter={(value: number) => formatMoney(value)} {...TOOLTIP_STYLE} />
          <Bar dataKey="expenses" fill="#EF4444" name="Расходы" radius={[4, 4, 0, 0]} />
          <Bar dataKey="income" fill="#22C55E" name="Доходы" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <div className="flex items-center justify-center text-gray-500" style={{ height }}>Нет данных</div>
    )
  )

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
              tooltip="Сумма расходных операций за период (без платежей по долгам)"
              sub={(() => {
                if (!summary) return null
                const parts: React.ReactNode[] = []
                if (summary.debtOps > 0) parts.push(<span key="d" className="text-orange-400">+ {formatMoney(summary.debtOps)} долги</span>)
                if (prevSummary && prevSummary.expense > 0) {
                  const pct = Math.round(((summary.expense - prevSummary.expense) / prevSummary.expense) * 100)
                  parts.push(<span key="p" className={pct > 0 ? 'text-red-400' : 'text-green-400'}>{pct > 0 ? '+' : ''}{pct}% к пред. пер.</span>)
                }
                return parts.length ? <>{parts.map((p, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{p}</React.Fragment>)}</> : null
              })()}
            />
            <StatCard
              label="Доходы"
              value={summary ? formatMoney(summary.income) : '—'}
              icon={<TrendingUp className="text-green-400" size={20} />}
              valueClass="text-green-400"
              tooltip="Сумма всех доходных операций за выбранный период"
            />
            <StatCard
              label="Остаток"
              value={summary ? formatMoney(summary.balance) : '—'}
              icon={<Wallet className="text-yellow-400" size={20} />}
              valueClass={summary && summary.balance >= 0 ? 'text-white' : 'text-red-400'}
              tooltip="Доходы − расходы − платежи по долгам за период"
            />
            <StatCard
              label="Средний расход/день"
              value={summary ? formatMoney(showDebtInAvg ? summary.avgPerDayWithDebt : summary.avgPerDay) : '—'}
              icon={<Calendar className="text-blue-400" size={20} />}
              valueClass="text-white"
              tooltip={showDebtInAvg ? 'С учётом платежей по долгам' : 'Без учёта платежей по долгам'}
              sub={summary && summary.debtOps > 0 ? (
                <label className="flex items-center gap-1.5 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={showDebtInAvg}
                    onChange={e => setShowDebtInAvg(e.target.checked)}
                    className="w-3 h-3 accent-blue-400"
                  />
                  <span className="text-xs text-gray-500">Учитывать долги</span>
                </label>
              ) : null}
            />
          </div>

          {/* Daily budget + Debt widget */}
          <div className="grid grid-cols-2 gap-4">
            {cashFlow && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={16} className="text-yellow-400" />
                  <h2 className="text-sm font-semibold text-white">Бюджет на сегодня</h2>
                  <InfoTooltip text="Дневной лимит = (доход месяца − обязательные платежи) ÷ число дней в месяце. Сальдо = накопленный лимит − фактические расходы." />
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
                {lastSaldo !== null && (() => {
                  const isGood = lastSaldo >= 0
                  const isWarn = lastSaldo < 0 && lastSaldo > -(cashFlow!.dailyBudget * 3)
                  const label = isGood ? 'В норме' : isWarn ? 'Внимание' : 'Превышение'
                  const cls = isGood ? 'bg-green-500/20 text-green-400 border-green-500/30' : isWarn ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                  return (
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
                      <span className={`text-xs ${isGood ? 'text-green-400' : isWarn ? 'text-yellow-400' : 'text-red-400'}`}>
                        Сальдо: {lastSaldo >= 0 ? '+' : ''}{formatMoney(lastSaldo)}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={16} className="text-red-400" />
                <h2 className="text-sm font-semibold text-white">Долговая нагрузка</h2>
                <InfoTooltip text="Остаток тела — сумма невыплаченного основного долга. Нач. % — проценты, накопившиеся с последнего платежа по текущий момент. Обяз. платёж/мес — сумма ежемесячных платежей по всем активным долгам." />
              </div>
              {debtOwed.length === 0 ? (
                <p className="text-gray-500 text-sm">Нет активных долгов</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-red-400 mb-1">{formatMoney(totalDebtOwed)}</p>
                  {totalAccrued > 0 && (
                    <p className="text-xs text-orange-400 mb-2">+ нач. % ≈ {formatMoney(totalAccrued)}</p>
                  )}
                  {totalMonthlyPayment > 0 && (
                    <p className="text-xs text-gray-400 mb-2">Обяз. платёж/мес: <span className="text-white font-medium">{formatMoney(totalMonthlyPayment)}</span></p>
                  )}
                  <div className="space-y-1">
                    {debtOwed.slice(0, 3).map(d => (
                      <div key={d.id} className="flex justify-between text-xs">
                        <span className="text-gray-400 truncate max-w-[60%]">{d.name}</span>
                        <span className="text-white font-medium">{formatMoney(d.current_balance ?? d.initial_amount ?? 0)}</span>
                      </div>
                    ))}
                    {debtOwed.length > 3 && (
                      <p className="text-xs text-gray-500">+{debtOwed.length - 3} ещё</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Upcoming debt payments (C) */}
          {upcomingDebts.length > 0 && (
            <div className="card border-blue-400/30 bg-blue-400/5">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={15} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Ближайшие платежи по долгам</h3>
                <span className="badge bg-blue-400/20 text-blue-400">{upcomingDebts.length}</span>
              </div>
              <div className="space-y-2">
                {upcomingDebts.map(d => {
                  const daysUntil = d.payment_day! - nowDay
                  return (
                    <div key={d.id} className="flex items-center justify-between text-sm py-1 border-t border-dark-600 first:border-t-0">
                      <span className="text-white">{d.name}</span>
                      <div className="flex items-center gap-3">
                        {d.monthly_payment && <span className="text-gray-400">{formatMoney(d.monthly_payment)}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${daysUntil === 0 ? 'bg-red-500/20 text-red-400' : daysUntil <= 3 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {daysUntil === 0 ? 'Сегодня' : `Через ${daysUntil} дн.`} ({d.payment_day}-го)
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending recurring operations */}
          {pendingRecurring.length > 0 && (
            <div className="card border-yellow-400/30 bg-yellow-400/5">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={15} className="text-yellow-400" />
                <h3 className="text-sm font-semibold text-white">Ожидают подтверждения</h3>
                <span className="badge bg-yellow-400/20 text-yellow-400">{pendingRecurring.length}</span>
              </div>
              <div className="space-y-2">
                {pendingRecurring.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1 border-t border-dark-600 first:border-t-0">
                    <span className="text-white">{r.name}</span>
                    <div className="flex items-center gap-3">
                      {r.amount > 0 && <span className="text-gray-400">{formatMoney(r.amount)}</span>}
                      <button
                        onClick={async () => {
                          await api.confirmRecurringOperation(r.id)
                          load()
                        }}
                        className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40 transition-colors"
                      >
                        Подтвердить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings goals (B) */}
          {(goals.length > 0 || true) && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-yellow-400" />
                  <h2 className="text-sm font-semibold text-white">Цели накопления</h2>
                </div>
                <button onClick={() => setGoalModal({})} className="text-gray-500 hover:text-yellow-400 p-1 transition-colors" title="Добавить цель">
                  <Plus size={16} />
                </button>
              </div>
              {goals.filter(g => g.status === 'active').length === 0 ? (
                <p className="text-gray-500 text-sm">Нет активных целей. <button onClick={() => setGoalModal({})} className="text-yellow-400 hover:underline">Добавить</button></p>
              ) : (
                <div className="space-y-4">
                  {goals.filter(g => g.status === 'active').map(goal => {
                    const pct = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
                    return (
                      <div key={goal.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: goal.color }} />
                            <span className="text-sm text-white">{goal.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{formatMoney(goal.current_amount)} / {formatMoney(goal.target_amount)}</span>
                            <button onClick={() => setGoalModal({ edit: goal })} className="p-1 text-gray-600 hover:text-yellow-400 transition-colors">
                              <Pencil size={11} />
                            </button>
                            <button onClick={async () => {
                              if (!confirm('Удалить цель?')) return
                              await api.deleteSavingsGoal(goal.id)
                              load()
                            }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-dark-600 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                        </div>
                        {goal.target_date && (
                          <p className="text-xs text-gray-600 mt-0.5">До {goal.target_date}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Expense type filter */}
          <div className="flex flex-wrap items-center gap-3">
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
            {expenseTypeFilter === '' && summary && summary.debtOps > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 hover:text-white">
                <input
                  type="checkbox"
                  checked={showDebtOpsInChart}
                  onChange={e => setShowDebtOpsInChart(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-400"
                />
                Включая платежи по долгам
              </label>
            )}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Donut chart with drill-down */}
            <div className="card">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold">Расходы по категориям</h2>
                <button onClick={() => setExpandedCard('donut')} className="text-gray-500 hover:text-white p-1">
                  <Maximize2 size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">Нажмите на сегмент для просмотра операций</p>
              <DonutChart />
            </div>

            {/* Bar chart — daily */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Динамика расходов</h2>
                <button onClick={() => setExpandedCard('daily')} className="text-gray-500 hover:text-white p-1">
                  <Maximize2 size={14} />
                </button>
              </div>
              <DailyChart />
            </div>
          </div>

          {/* Monthly chart */}
          {showMonthly && monthly.length > 1 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Расходы по месяцам</h2>
                <button onClick={() => setExpandedCard('monthly')} className="text-gray-500 hover:text-white p-1">
                  <Maximize2 size={14} />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(value: number) => formatMoney(value)} {...TOOLTIP_STYLE} />
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Топ-5 категорий</h2>
                <button onClick={() => setExpandedCard('top5')} className="text-gray-500 hover:text-white p-1" title="Все категории">
                  <List size={14} />
                </button>
              </div>
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

      {/* Expanded card modals */}
      {expandedCard === 'donut' && (
        <ExpandModal title="Расходы по категориям" onClose={() => setExpandedCard(null)}>
          <DonutChart outerRadius={180} innerRadius={110} height={480} threshold={0.02} />
        </ExpandModal>
      )}
      {expandedCard === 'daily' && (
        <ExpandModal title="Динамика расходов" onClose={() => setExpandedCard(null)}>
          <DailyChart height={400} />
        </ExpandModal>
      )}
      {expandedCard === 'top5' && (
        <ExpandModal title="Все категории за период" onClose={() => setExpandedCard(null)}>
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              {categories.map((cat, i) => {
                const pct = Math.round((cat.total / totalExpense) * 100)
                return (
                  <div key={cat.id} className="flex items-center gap-3 cursor-pointer hover:opacity-80" onClick={() => { openDrill(cat); setExpandedCard(null) }}>
                    <span className="text-gray-500 text-sm w-6">{i + 1}</span>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#FFD600' }} />
                    <span className="flex-1 text-sm text-white">{cat.name}</span>
                    <span className="text-gray-400 text-sm w-10 text-right">{pct}%</span>
                    <span className="text-white font-medium text-sm w-32 text-right">{formatMoney(cat.total)}</span>
                  </div>
                )
              })}
              {categories.length === 0 && <p className="text-gray-500 text-sm">Нет данных</p>}
            </div>
            <DonutChart outerRadius={140} innerRadius={85} height={420} threshold={0.02} />
          </div>
        </ExpandModal>
      )}

      {goalModal !== null && (
        <AddGoalModal
          editGoal={goalModal.edit}
          onClose={() => setGoalModal(null)}
          onSaved={() => { setGoalModal(null); load() }}
        />
      )}

      {expandedCard === 'monthly' && showMonthly && monthly.length > 1 && (
        <ExpandModal title="Расходы по месяцам" onClose={() => setExpandedCard(null)}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={monthly} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
              <Tooltip formatter={(value: number) => formatMoney(value)} {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
              <Bar dataKey="daily" stackId="a" fill="#FFD600" name="Повседневные" />
              <Bar dataKey="big" stackId="a" fill="#F97316" name="Крупные" />
              <Bar dataKey="apartment" stackId="a" fill="#3B82F6" name="Квартира" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, valueClass, sub, tooltip }: {
  label: string; value: string; icon: React.ReactNode; valueClass: string; sub?: React.ReactNode; tooltip?: string
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs mt-1">{sub}</div>}
    </div>
  )
}
