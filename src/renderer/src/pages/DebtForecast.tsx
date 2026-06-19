import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi'
import { Debt } from '../types'
import { formatMoney } from '../utils'

interface Props {
  debtId: number
  onBack: () => void
}

interface ForecastRow {
  month: number
  payment: number
  interestCovered: number
  poolCovered: number
  bodyCovered: number
  totalBalance: number
  overduePool: number
}

// Merge two forecast arrays by month for dual-line chart
function mergeForChart(
  f1: ForecastRow[],
  f2: ForecastRow[]
): Array<{ month: number; balance1?: number; balance2?: number }> {
  const maxMonth = Math.max(f1.length > 0 ? f1[f1.length - 1].month : 0, f2.length > 0 ? f2[f2.length - 1].month : 0)
  const result = []
  for (let m = 1; m <= maxMonth; m++) {
    const r1 = f1.find(r => r.month === m)
    const r2 = f2.find(r => r.month === m)
    result.push({
      month: m,
      balance1: r1?.totalBalance,
      balance2: r2?.totalBalance,
    })
  }
  return result
}

export default function DebtForecast({ debtId, onBack }: Props) {
  const api = useApi()
  const [debt, setDebt] = useState<Debt | null>(null)
  const [payment1, setPayment1] = useState('')
  const [payment2, setPayment2] = useState('')
  const [forecast1, setForecast1] = useState<ForecastRow[]>([])
  const [forecast2, setForecast2] = useState<ForecastRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    api.getDebt(debtId).then(d => setDebt(d as Debt))
  }, [debtId])

  async function getForecast(payment: number): Promise<ForecastRow[]> {
    if (debt?.debt_type === 'dad') {
      return api.getDadForecast(debtId, payment) as Promise<ForecastRow[]>
    }
    return api.getSimpleForecast(debtId, payment) as Promise<ForecastRow[]>
  }

  async function generate() {
    if (!payment1 || !debt) return
    setLoading(true)
    setGenerated(false)
    const [f1, f2] = await Promise.all([
      getForecast(parseFloat(payment1)),
      payment2 ? getForecast(parseFloat(payment2)) : Promise.resolve([]),
    ])
    setForecast1(f1 as ForecastRow[])
    setForecast2(f2 as ForecastRow[])
    setLoading(false)
    setGenerated(true)
  }

  const totalInterest1 = forecast1.reduce((s, r) => s + r.interestCovered + r.poolCovered, 0)
  const totalInterest2 = forecast2.reduce((s, r) => s + r.interestCovered + r.poolCovered, 0)
  const chartData = mergeForChart(forecast1, forecast2)
  const isDad = debt?.debt_type === 'dad'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-2 -ml-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">
          Прогноз погашения{debt ? ` — ${debt.name}` : ''}
        </h1>
      </div>

      <p className="text-gray-500 text-sm">
        Расчётный инструмент «что если» — не записывает фактические платежи в историю.
        {isDad && ' Расчёт по точному алгоритму: проценты по траншам, пул просроченных %.'}
      </p>

      {/* Scenario inputs */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Сценарии</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Сценарий 1: ежемесячный платёж, ₽</label>
            <input
              type="number"
              value={payment1}
              onChange={e => setPayment1(e.target.value)}
              placeholder="например, 80000"
              className="input"
            />
          </div>
          <div>
            <label className="label">Сценарий 2 (для сравнения): платёж, ₽</label>
            <input
              type="number"
              value={payment2}
              onChange={e => setPayment2(e.target.value)}
              placeholder="например, 120000"
              className="input"
            />
          </div>
        </div>
        <button onClick={generate} disabled={!payment1 || loading || !debt} className="btn-primary">
          {loading ? 'Расчёт...' : 'Рассчитать прогноз'}
        </button>
      </div>

      {generated && (
        <>
          {/* Summary comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card" style={{ borderColor: 'rgba(255,214,0,0.3)' }}>
              <p className="text-xs text-gray-400 uppercase mb-2">Сценарий 1 — {formatMoney(parseFloat(payment1))}/мес</p>
              <p className="text-sm text-gray-300 mb-1">Месяцев до погашения: <span className="text-white font-bold">{forecast1.length}</span></p>
              <p className="text-sm text-gray-300">Всего процентов: <span className="text-red-400 font-bold">{formatMoney(totalInterest1)}</span></p>
            </div>
            {forecast2.length > 0 && (
              <div className="card" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
                <p className="text-xs text-gray-400 uppercase mb-2">Сценарий 2 — {formatMoney(parseFloat(payment2))}/мес</p>
                <p className="text-sm text-gray-300 mb-1">Месяцев до погашения: <span className="text-white font-bold">{forecast2.length}</span></p>
                <p className="text-sm text-gray-300">Всего процентов: <span className="text-red-400 font-bold">{formatMoney(totalInterest2)}</span></p>
                {forecast2.length < forecast1.length && (
                  <p className="text-sm text-green-400 mt-2 font-medium">
                    На {forecast1.length - forecast2.length} мес. быстрее, экономия {formatMoney(totalInterest1 - totalInterest2)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Chart — merged data on single LineChart */}
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Динамика остатка долга</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  label={{ value: 'месяц', position: 'insideBottom', offset: -10, fill: '#6B7280', fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}к`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatMoney(value), name]}
                  contentStyle={{ backgroundColor: '#242424', border: '1px solid #3A3A3A', borderRadius: '12px' }}
                  labelStyle={{ color: '#9CA3AF', marginBottom: 4 }}
                  labelFormatter={v => `Месяц ${v}`}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  dataKey="balance1"
                  stroke="#FFD600"
                  name={`Сценарий 1 (${formatMoney(parseFloat(payment1))}/мес)`}
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
                {forecast2.length > 0 && (
                  <Line
                    dataKey="balance2"
                    stroke="#3B82F6"
                    name={`Сценарий 2 (${formatMoney(parseFloat(payment2))}/мес)`}
                    dot={false}
                    strokeWidth={2}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Table — Scenario 1 */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600">
              <h2 className="text-base font-semibold">Прогнозный график — Сценарий 1</h2>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              <table className="w-full">
                <thead className="sticky top-0 bg-dark-800">
                  <tr className="border-b border-dark-600">
                    <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Месяц</th>
                    <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Платёж</th>
                    <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Проценты</th>
                    {isDad && <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Пул %</th>}
                    <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Тело</th>
                    <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast1.map(row => (
                    <tr key={row.month} className="border-b border-dark-600 hover:bg-dark-700">
                      <td className="px-5 py-2.5 text-sm text-gray-300">{row.month}</td>
                      <td className="px-5 py-2.5 text-sm text-right text-white">{formatMoney(row.payment)}</td>
                      <td className="px-5 py-2.5 text-sm text-right text-red-400">{formatMoney(row.interestCovered)}</td>
                      {isDad && (
                        <td className="px-5 py-2.5 text-sm text-right text-orange-400">
                          {row.poolCovered > 0 ? formatMoney(row.poolCovered) : '—'}
                        </td>
                      )}
                      <td className="px-5 py-2.5 text-sm text-right text-green-400">{formatMoney(row.bodyCovered)}</td>
                      <td className="px-5 py-2.5 text-sm text-right font-semibold text-white">{formatMoney(row.totalBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
