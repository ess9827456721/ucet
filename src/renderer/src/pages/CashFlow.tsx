import React, { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { CashFlowData } from '../types'
import { formatMoney, formatDate } from '../utils'

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export default function CashFlow() {
  const api = useApi()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<CashFlowData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await api.getCashFlow(year, month)
    setData(d as CashFlowData)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Кассовый поток</h1>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-semibold text-lg min-w-36 text-center">
            {MONTHS_RU[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Загрузка...</div>
      ) : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Доходы за период</p>
              <p className="text-2xl font-bold text-green-400">{formatMoney(data.income)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Обязательные расходы</p>
              <p className="text-2xl font-bold text-red-400">{formatMoney(data.mandatory)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Бюджет на день</p>
              <p className="text-2xl font-bold text-yellow-400">{formatMoney(data.dailyBudget)}</p>
              <p className="text-xs text-gray-500 mt-1">(Доходы − Обязательные) / дни</p>
            </div>
          </div>

          {/* Daily journal */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600">
              <h2 className="text-base font-semibold text-white">Дневной журнал</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Дата</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Траты за день</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Накопленный лимит</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Сальдо</th>
                </tr>
              </thead>
              <tbody>
                {data.journal.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-500">Нет операций за выбранный период</td>
                  </tr>
                ) : data.journal.map(row => (
                  <tr
                    key={row.date}
                    className={`border-b border-dark-600 ${row.saldo < 0 ? 'bg-red-900/10' : 'hover:bg-dark-700'} transition-colors`}
                  >
                    <td className="px-5 py-3 text-sm text-gray-300">{formatDate(row.date)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(row.dayExpenses)}</td>
                    <td className="px-5 py-3 text-sm text-right text-gray-300">{formatMoney(row.cumLimit)}</td>
                    <td className={`px-5 py-3 text-sm text-right font-semibold ${row.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.saldo >= 0 ? '+' : ''}{formatMoney(row.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
