import React, { useEffect, useState } from 'react'
import { ArrowLeft, Plus, TrendingDown } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Debt, Tranche, DadPayment, SimpleDebtPayment } from '../types'
import { formatMoney, formatDate, today } from '../utils'

interface Props {
  debtId: number
  onBack: () => void
  onForecast: () => void
}

export default function DebtDetail({ debtId, onBack, onForecast }: Props) {
  const api = useApi()
  const [debt, setDebt] = useState<Debt | null>(null)
  const [tranches, setTranches] = useState<Tranche[]>([])
  const [dadPayments, setDadPayments] = useState<DadPayment[]>([])
  const [simplePayments, setSimplePayments] = useState<SimpleDebtPayment[]>([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showAddTranche, setShowAddTranche] = useState(false)
  const [loading, setLoading] = useState(true)

  // Payment form state
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [daysSince, setDaysSince] = useState('30')
  const [interestPart, setInterestPart] = useState('')
  const [payError, setPayError] = useState('')
  const [paying, setPaying] = useState(false)

  // Add tranche form state
  const [trancheDate, setTrancheDate] = useState(today())
  const [trancheAmount, setTrancheAmount] = useState('')
  const [trancheRate, setTrancheRate] = useState('')
  const [savingTranche, setSavingTranche] = useState(false)

  async function load() {
    setLoading(true)
    const [d, t] = await Promise.all([
      api.getDebt(debtId),
      api.getTranches(debtId),
    ])
    setDebt(d as Debt)
    setTranches(t as Tranche[])
    if ((d as Debt).debt_type === 'dad') {
      const ph = await api.getDadPaymentHistory(debtId)
      setDadPayments(ph as DadPayment[])
    } else {
      const ph = await api.getSimpleDebtPayments(debtId)
      setSimplePayments(ph as SimpleDebtPayment[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [debtId])

  async function handlePay() {
    if (!payAmount || parseFloat(payAmount) <= 0) { setPayError('Укажите сумму'); return }
    setPaying(true)
    try {
      if (debt?.debt_type === 'dad') {
        await api.processDadPayment(debtId, parseFloat(payAmount), payDate, parseInt(daysSince) || 30)
      } else {
        await api.processSimplePayment(debtId, parseFloat(payAmount), payDate, parseFloat(interestPart) || 0)
      }
      setShowPaymentForm(false)
      setPayAmount('')
      load()
    } catch (e) {
      setPayError('Ошибка при сохранении платежа')
    } finally {
      setPaying(false)
    }
  }

  async function handleAddTranche() {
    if (!trancheAmount || !trancheRate) return
    setSavingTranche(true)
    try {
      await api.addTranche({
        debt_id: debtId,
        date: trancheDate,
        initial_amount: parseFloat(trancheAmount),
        interest_rate: parseFloat(trancheRate) / 100,
      })
      // Update total
      await api.updateDebt(debtId, {
        initial_amount: tranches.reduce((s, t) => s + t.initial_amount, 0) + parseFloat(trancheAmount)
      })
      setShowAddTranche(false)
      setTrancheAmount('')
      setTrancheRate('')
      load()
    } finally {
      setSavingTranche(false)
    }
  }

  if (loading || !debt) {
    return <div className="p-6 text-center text-gray-500">Загрузка...</div>
  }

  const activeTranches = tranches.filter(t => t.status === 'active')
  const totalBalance = activeTranches.reduce((s, t) => s + t.current_balance, 0)
  const weightedRate = activeTranches.length > 0
    ? activeTranches.reduce((s, t) => s + t.current_balance * t.interest_rate, 0) / totalBalance
    : 0

  const totalPaid = debt.debt_type === 'simple'
    ? simplePayments.reduce((s, p) => s + p.body_part, 0)
    : dadPayments.reduce((s, p) => s + p.body_covered, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-2 -ml-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{debt.name}</h1>
            <span className={`badge ${debt.direction === 'i_owe' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
              {debt.direction === 'i_owe' ? 'Я должен' : 'Мне должны'}
            </span>
          </div>
        </div>
        <button onClick={onForecast} className="btn-secondary text-sm">
          Прогноз погашения
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Остаток тела</p>
          <p className="text-2xl font-bold text-white">{formatMoney(debt.debt_type === 'dad' ? totalBalance : (debt.initial_amount || 0) - totalPaid)}</p>
        </div>
        {debt.debt_type === 'dad' && (
          <>
            <div className="card">
              <p className="text-xs text-gray-400 mb-2">Средневзвешенная ставка</p>
              <p className="text-2xl font-bold text-yellow-400">{(weightedRate * 100).toFixed(2)}%</p>
              <p className="text-xs text-gray-500 mt-1">Только для отображения</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 mb-2">Пул просроченных %</p>
              <p className={`text-2xl font-bold ${debt.overdue_interest_pool > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {formatMoney(debt.overdue_interest_pool)}
              </p>
            </div>
          </>
        )}
        {debt.debt_type === 'simple' && debt.interest_rate && (
          <div className="card">
            <p className="text-xs text-gray-400 mb-2">Процентная ставка</p>
            <p className="text-2xl font-bold text-yellow-400">{(debt.interest_rate * 100).toFixed(1)}%</p>
          </div>
        )}
        <div className="card">
          <p className="text-xs text-gray-400 mb-2">Погашено тела</p>
          <p className="text-2xl font-bold text-green-400">{formatMoney(totalPaid)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="btn-primary flex items-center gap-2">
          <TrendingDown size={16} /> Внести платёж
        </button>
        {debt.debt_type === 'dad' && (
          <button onClick={() => setShowAddTranche(!showAddTranche)} className="btn-secondary flex items-center gap-2">
            <Plus size={16} /> Добавить транш
          </button>
        )}
      </div>

      {/* Payment form */}
      {showPaymentForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">Внести платёж</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Дата платежа</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Сумма платежа, ₽</label>
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="input" />
            </div>
          </div>
          {debt.debt_type === 'dad' && (
            <div>
              <label className="label">Дней с предыдущего платежа</label>
              <input type="number" value={daysSince} onChange={e => setDaysSince(e.target.value)} className="input w-40" />
            </div>
          )}
          {debt.debt_type === 'simple' && (
            <div>
              <label className="label">Из них на проценты, ₽ (необязательно)</label>
              <input type="number" value={interestPart} onChange={e => setInterestPart(e.target.value)} className="input w-48" />
            </div>
          )}
          {payError && <p className="text-red-400 text-sm">{payError}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setShowPaymentForm(false); setPayError('') }} className="btn-secondary">Отмена</button>
            <button onClick={handlePay} disabled={paying} className="btn-primary">
              {paying ? 'Обработка...' : 'Провести'}
            </button>
          </div>
        </div>
      )}

      {/* Add tranche form */}
      {showAddTranche && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">Новый транш</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Дата получения</label>
              <input type="date" value={trancheDate} onChange={e => setTrancheDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Сумма транша, ₽</label>
              <input type="number" value={trancheAmount} onChange={e => setTrancheAmount(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Ставка, % год.</label>
              <input type="number" value={trancheRate} onChange={e => setTrancheRate(e.target.value)} placeholder="38.3" className="input" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAddTranche(false)} className="btn-secondary">Отмена</button>
            <button onClick={handleAddTranche} disabled={savingTranche} className="btn-primary">
              {savingTranche ? 'Сохранение...' : 'Добавить транш'}
            </button>
          </div>
        </div>
      )}

      {/* Tranches table (dad) */}
      {debt.debt_type === 'dad' && tranches.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-base font-semibold">Транши</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Изначальная сумма</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Остаток тела</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Ставка</th>
                <th className="text-center text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {tranches.map(t => (
                <tr key={t.id} className="border-b border-dark-600 hover:bg-dark-700">
                  <td className="px-5 py-3 text-sm text-gray-300">{formatDate(t.date)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-300">{formatMoney(t.initial_amount)}</td>
                  <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(t.current_balance)}</td>
                  <td className="px-5 py-3 text-sm text-right text-yellow-400">{(t.interest_rate * 100).toFixed(1)}%</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`badge ${t.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-dark-600 text-gray-500'}`}>
                      {t.status === 'active' ? 'Активен' : 'Погашен'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment history */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600">
          <h2 className="text-base font-semibold">История платежей</h2>
        </div>
        {debt.debt_type === 'dad' ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Платёж</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Текущие %</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Пул %</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Тело</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">В пул</th>
              </tr>
            </thead>
            <tbody>
              {dadPayments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500">Платежей нет</td></tr>
              ) : dadPayments.map(p => (
                <tr key={p.id} className="border-b border-dark-600 hover:bg-dark-700">
                  <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.payment_date)}</td>
                  <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(p.total_amount)}</td>
                  <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(p.interest_covered)}</td>
                  <td className="px-5 py-3 text-sm text-right text-orange-400">{formatMoney(p.pool_covered)}</td>
                  <td className="px-5 py-3 text-sm text-right text-green-400">{formatMoney(p.body_covered)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-400">
                    {p.overdue_added_to_pool > 0 ? <span className="text-red-400">+{formatMoney(p.overdue_added_to_pool)}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Платёж</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Проценты</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Тело</th>
              </tr>
            </thead>
            <tbody>
              {simplePayments.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-500">Платежей нет</td></tr>
              ) : simplePayments.map(p => (
                <tr key={p.id} className="border-b border-dark-600 hover:bg-dark-700">
                  <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.payment_date)}</td>
                  <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(p.total_amount)}</td>
                  <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(p.interest_part)}</td>
                  <td className="px-5 py-3 text-sm text-right text-green-400">{formatMoney(p.body_part)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
