import React, { useEffect, useState } from 'react'
import { ArrowLeft, Plus, TrendingDown, BarChart2, Pencil, Trash2, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Debt, Tranche, DadPayment, SimpleDebtPayment } from '../types'
import { formatMoney, formatDate, today } from '../utils'
import InfoTooltip from '../components/InfoTooltip'

interface Props {
  debtId: number
  onBack: () => void
  onForecast: () => void
  onAnalytics: () => void
}

interface EditDadPayment { id: number; date: string; amount: string }
interface EditSimplePayment { id: number; date: string; amount: string; interestPart: string }
interface EditTrancheState { id: number; date: string; rate: string }

export default function DebtDetail({ debtId, onBack, onForecast, onAnalytics }: Props) {
  const api = useApi()
  const [debt, setDebt] = useState<Debt | null>(null)
  const [tranches, setTranches] = useState<Tranche[]>([])
  const [dadPayments, setDadPayments] = useState<DadPayment[]>([])
  const [simplePayments, setSimplePayments] = useState<SimpleDebtPayment[]>([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showAddTranche, setShowAddTranche] = useState(false)
  const [editDadPay, setEditDadPay] = useState<EditDadPayment | null>(null)
  const [editSimplePay, setEditSimplePay] = useState<EditSimplePayment | null>(null)
  const [editTranche, setEditTranche] = useState<EditTrancheState | null>(null)
  const [loading, setLoading] = useState(true)

  // Payment form state
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [computedDays, setComputedDays] = useState<{ days: number; since: string } | null>(null)
  const [interestPart, setInterestPart] = useState('')
  const [simplePaymentType, setSimplePaymentType] = useState<'mandatory' | 'early'>('mandatory')
  const [newMonthlyPayment, setNewMonthlyPayment] = useState('')
  const [payError, setPayError] = useState('')
  const [paying, setPaying] = useState(false)

  // Algorithm settings state (dad debts)
  const [showAlgoSettings, setShowAlgoSettings] = useState(false)
  const [algoOrder, setAlgoOrder] = useState<string>('highest_rate')
  const [algoPoolRatio, setAlgoPoolRatio] = useState(50)
  const [savingAlgo, setSavingAlgo] = useState(false)

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
    const debtData = d as Debt
    setDebt(debtData)
    if (debtData.debt_type === 'dad') {
      setAlgoOrder(debtData.tranche_payoff_order ?? 'highest_rate')
      setAlgoPoolRatio(Math.round((debtData.pool_ratio ?? 0.5) * 100))
    }
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

  // Auto-compute days since last payment when payment date changes
  useEffect(() => {
    if (!showPaymentForm || debt?.debt_type !== 'dad') return
    api.getDaysSinceLastPayment(debtId, payDate).then(r => setComputedDays(r))
  }, [payDate, showPaymentForm, debt?.debt_type])

  async function handlePay() {
    if (!payAmount || parseFloat(payAmount) <= 0) { setPayError('Укажите сумму'); return }
    setPaying(true)
    try {
      if (debt?.debt_type === 'dad') {
        const result = await api.processDadPayment(debtId, parseFloat(payAmount), payDate) as { overpayment?: number; overdueAddedToPool?: number; paymentId?: number }
        if (result?.overpayment && result.overpayment > 0.01) {
          alert(`Долг полностью погашен.\nИзлишек платежа: ${result.overpayment.toFixed(2)} ₽ — эта сумма не была отнесена к телу долга.`)
        } else if (result?.overdueAddedToPool && result.overdueAddedToPool > 0.01 && result?.paymentId) {
          const confirm = window.confirm(
            'Платёж не покрывает текущие проценты периода — обычно это означает, что начисленный процент уйдёт в просрочку.\n\nОтметить этот платёж как окончательный для месяца, чтобы не показывать предупреждение о просрочке на карточке долга?'
          )
          if (confirm) {
            await api.markDadPaymentSufficient(result.paymentId)
          }
        }
      } else {
        const result = await api.processSimplePayment(debtId, parseFloat(payAmount), payDate, parseFloat(interestPart) || 0, simplePaymentType)
        if (result?.overpayment && result.overpayment > 0.01) {
          alert(`Долг полностью погашен.\nИзлишек платежа: ${result.overpayment.toFixed(2)} ₽ — эта сумма не была отнесена к телу долга.`)
        }
      }
      if (simplePaymentType === 'early' && newMonthlyPayment && parseFloat(newMonthlyPayment) > 0) {
        await api.updateDebt(debtId, { monthly_payment: parseFloat(newMonthlyPayment) })
      }
      setShowPaymentForm(false)
      setPayAmount('')
      setSimplePaymentType('mandatory')
      setNewMonthlyPayment('')
      load()
    } catch {
      setPayError('Ошибка при сохранении платежа')
    } finally {
      setPaying(false)
    }
  }

  async function handleSaveAlgoSettings() {
    setSavingAlgo(true)
    await api.updateDebt(debtId, { tranche_payoff_order: algoOrder, pool_ratio: algoPoolRatio / 100 })
    setSavingAlgo(false)
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
      setShowAddTranche(false)
      setTrancheAmount('')
      setTrancheRate('')
      load()
    } finally {
      setSavingTranche(false)
    }
  }

  async function handleSaveTranche() {
    if (!editTranche) return
    const result = await api.updateTranche(editTranche.id, {
      date: editTranche.date,
      interest_rate: parseFloat(editTranche.rate) / 100,
    })
    if (!result.ok) {
      alert(result.reason ?? 'Ошибка при обновлении транша')
      return
    }
    setEditTranche(null)
    load()
  }

  async function handleDeleteTranche(t: Tranche) {
    if (!confirm(`Удалить транш от ${formatDate(t.date)}?`)) return
    const result = await api.deleteTranche(t.id)
    if (!result.ok) {
      alert(result.reason ?? 'Невозможно удалить транш')
      return
    }
    load()
  }

  async function handleDeleteDadPayment(paymentId: number) {
    if (!confirm('Удалить платёж? Все последующие платежи будут пересчитаны автоматически.')) return
    await api.deleteDadPayment(paymentId)
    load()
  }

  async function handleDeleteSimplePayment(paymentId: number) {
    const hasLater = await api.hasSimplePaymentsAfter(paymentId)
    const warning = hasLater ? '\n⚠️ Этот платёж не последний. Удаление пересчитает общий остаток долга.' : ''
    if (!confirm(`Удалить платёж?${warning}`)) return
    await api.deleteSimpleDebtPayment(paymentId)
    load()
  }

  async function handleSaveDadPayment() {
    if (!editDadPay) return
    const amount = parseFloat(editDadPay.amount)
    if (!amount || amount <= 0) return
    await api.updateDadPayment(editDadPay.id, editDadPay.date, amount)
    setEditDadPay(null)
    load()
  }

  async function handleSaveSimplePayment() {
    if (!editSimplePay) return
    await api.updateSimpleDebtPayment(
      editSimplePay.id,
      parseFloat(editSimplePay.amount),
      editSimplePay.date,
      parseFloat(editSimplePay.interestPart) || 0
    )
    setEditSimplePay(null)
    load()
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

  // Б4: расчёт накопленного процента выполняется на backend (getDebt), фронт не дублирует
  const accruedInterest = debt.accrued_interest ?? 0

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
        <button onClick={onAnalytics} className="btn-secondary text-sm flex items-center gap-1.5">
          <BarChart2 size={14} /> Аналитика
        </button>
        <button onClick={onForecast} className="btn-secondary text-sm">
          Прогноз погашения
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
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
        {(accruedInterest > 0 || debt.interest_rate) && (
          <div className="card">
            <div className="flex items-center gap-1 mb-2">
              <p className="text-xs text-gray-400">Накопленный процент</p>
              <InfoTooltip text="Проценты, начисленные с момента последнего платежа по текущей ставке. Не включает пул просроченных процентов (если есть) — он показан отдельной картой и гасится постепенно с каждым платежом." />
            </div>
            <p className="text-2xl font-bold text-orange-400">{formatMoney(accruedInterest)}</p>
            <p className="text-xs text-gray-500 mt-1">На сегодня</p>
          </div>
        )}
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
          {debt.debt_type === 'dad' && computedDays && (
            <p className="text-sm text-gray-400">
              Дней с предыдущего платежа:{' '}
              <span className="text-white font-medium">{computedDays.days}</span>
              {' '}(с {formatDate(computedDays.since)})
            </p>
          )}
          {debt.debt_type === 'simple' && (
            <div>
              <label className="label">Из них на проценты, ₽ (необязательно)</label>
              <input type="number" value={interestPart} onChange={e => setInterestPart(e.target.value)} className="input w-48" />
            </div>
          )}
          {debt.debt_type === 'simple' && payAmount &&
            parseFloat(payAmount) - (parseFloat(interestPart) || 0) > (debt.initial_amount || 0) - totalPaid + 0.01 && (
            <p className="text-yellow-400 text-xs">
              Сумма превышает остаток долга ({formatMoney((debt.initial_amount || 0) - totalPaid)} + проценты).
              Излишек {formatMoney(parseFloat(payAmount) - (parseFloat(interestPart) || 0) - ((debt.initial_amount || 0) - totalPaid))} не будет отнесён к телу долга.
            </p>
          )}
          {debt.debt_type === 'simple' && (
            <div className="space-y-2">
              <label className="label">Тип платежа</label>
              <div className="flex gap-2">
                {([['mandatory', 'Обязательный платёж'], ['early', 'Досрочное погашение']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setSimplePaymentType(val); setNewMonthlyPayment('') }}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      simplePaymentType === val
                        ? 'bg-yellow-400 text-dark-900'
                        : 'bg-dark-700 text-gray-400 hover:text-white border border-dark-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {simplePaymentType === 'mandatory' && (
                <p className="text-xs text-gray-500">Закрывает обязательный платёж периода — уведомление о просрочке снимется</p>
              )}
              {simplePaymentType === 'early' && (
                <p className="text-xs text-gray-500">Досрочное погашение тела долга — не закрывает обязательный платёж периода</p>
              )}
            </div>
          )}
          {simplePaymentType === 'early' && debt.debt_type === 'simple' && (
            <div>
              <label className="label">Новый ежемесячный платёж, ₽ (необязательно)</label>
              <input
                type="number"
                value={newMonthlyPayment}
                onChange={e => setNewMonthlyPayment(e.target.value)}
                placeholder={debt.monthly_payment ? String(debt.monthly_payment) : '0'}
                className="input w-48"
              />
            </div>
          )}
          {payError && <p className="text-red-400 text-sm">{payError}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setShowPaymentForm(false); setPayError(''); setSimplePaymentType('mandatory') }} className="btn-secondary">Отмена</button>
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

      {/* Algorithm settings (dad) */}
      {debt.debt_type === 'dad' && (
        <div className="card">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowAlgoSettings(v => !v)}
          >
            {showAlgoSettings ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRightIcon size={16} className="text-gray-400" />}
            <span className="text-sm font-semibold text-gray-200">Настройки алгоритма погашения</span>
            <InfoTooltip text="Параметры применяются автоматически ко всем будущим платежам. Уже проведённые платежи не пересчитываются." />
          </button>
          {showAlgoSettings && (
            <div className="mt-4 space-y-6">
              {/* Tranche order */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-medium text-gray-300">Порядок погашения тела между траншами</p>
                  <InfoTooltip text="Когда ваш платёж покрывает текущие проценты и ещё остаётся сумма на погашение основного долга — в какой очерёдности уменьшать остатки разных траншей?" />
                </div>
                <div className="space-y-2">
                  {([
                    { value: 'highest_rate', label: 'Сначала с высокой ставкой', desc: 'Выгоднее математически: экономит на будущих процентах, так как дорогие транши закрываются быстрее' },
                    { value: 'smallest_balance', label: 'Снежный ком (сначала меньший остаток)', desc: 'Сначала полностью закрываем транши с наименьшим остатком тела. Количество активных траншей уменьшается быстрее — психологически легче видеть прогресс' },
                    { value: 'earliest_first', label: 'Сначала ранние (по дате)', desc: 'Закрываем транши в порядке получения. Удобно, если хочется видеть, как исчезают самые первые обязательства' },
                    { value: 'proportional', label: 'Пропорционально остаткам', desc: 'Каждый платёж уменьшает все транши одновременно, в соответствии с их текущими долями' },
                  ] as const).map(opt => (
                    <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${algoOrder === opt.value ? 'border-yellow-400/50 bg-yellow-400/5' : 'border-dark-500 hover:border-dark-400'}`}>
                      <input
                        type="radio"
                        name="tranche_order"
                        value={opt.value}
                        checked={algoOrder === opt.value}
                        onChange={() => setAlgoOrder(opt.value)}
                        className="mt-0.5 accent-yellow-400"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-200">{opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Pool ratio slider */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-medium text-gray-300">Распределение остатка после покрытия текущих процентов</p>
                  <InfoTooltip text="Шаг 1: платёж покрывает текущие проценты за период. Шаг 2: остаток распределяется между погашением накопленных просроченных процентов (пул) и погашением основного тела долга. При 0% на пул — тело уменьшается быстрее. При 100% на пул — сначала полностью закрываем долг по просроченным процентам." />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                  <span>← 100% на пул просроченных %</span>
                  <span className="flex-1 text-center text-gray-300 font-medium">
                    На пул: {algoPoolRatio}% / На тело: {100 - algoPoolRatio}%
                  </span>
                  <span>100% на тело долга →</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={algoPoolRatio}
                  onChange={e => setAlgoPoolRatio(Number(e.target.value))}
                  className="w-full accent-yellow-400"
                />
                {/* Preview */}
                {(() => {
                  const lastPay = dadPayments.length > 0
                    ? dadPayments.reduce((a, b) => a.payment_date > b.payment_date ? a : b)
                    : null
                  const examplePayment = lastPay?.total_amount ?? 27_000
                  const exampleInterest = lastPay?.interest_covered ?? 19_000
                  const remainder = Math.max(0, examplePayment - exampleInterest)
                  const toPool = Math.round(remainder * algoPoolRatio / 100)
                  const toBody = remainder - toPool
                  return remainder > 0 ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Пример: платёж {examplePayment.toLocaleString('ru')} ₽, проценты {exampleInterest.toLocaleString('ru')} ₽ → остаток {remainder.toLocaleString('ru')} ₽ →{' '}
                      на пул: <span className="text-orange-400">{toPool.toLocaleString('ru')} ₽</span>, на тело: <span className="text-green-400">{toBody.toLocaleString('ru')} ₽</span>
                    </p>
                  ) : null
                })()}
              </div>

              <button onClick={handleSaveAlgoSettings} disabled={savingAlgo} className="btn-primary">
                {savingAlgo ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tranches table (dad) */}
      {debt.debt_type === 'dad' && tranches.length > 0 && (
        <div className="card p-0">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-base font-semibold">Транши</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Изначальная сумма</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Остаток тела</th>
                <th className="text-right text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Ставка</th>
                <th className="text-center text-xs text-gray-400 uppercase tracking-wide px-5 py-3">Статус</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {tranches.map(t => {
                const partiallyPaid = t.current_balance < t.initial_amount - 0.01
                return (
                  <React.Fragment key={t.id}>
                    <tr className="border-b border-dark-600 hover:bg-dark-700">
                      <td className="px-5 py-3 text-sm text-gray-300">{formatDate(t.date)}</td>
                      <td className="px-5 py-3 text-sm text-right text-gray-300">{formatMoney(t.initial_amount)}</td>
                      <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(t.current_balance)}</td>
                      <td className="px-5 py-3 text-sm text-right text-yellow-400">{(t.interest_rate * 100).toFixed(1)}%</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge ${t.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-dark-600 text-gray-500'}`}>
                          {t.status === 'active' ? 'Активен' : 'Погашен'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => setEditTranche({ id: t.id, date: t.date, rate: String((t.interest_rate * 100).toFixed(2)) })}
                            className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
                            title="Редактировать транш"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteTranche(t)}
                            disabled={partiallyPaid}
                            className={`p-1.5 transition-colors ${partiallyPaid ? 'text-gray-700 cursor-not-allowed' : 'text-gray-500 hover:text-red-400'}`}
                            title={partiallyPaid ? 'Нельзя удалить частично погашенный транш' : 'Удалить транш'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editTranche?.id === t.id && (
                      <tr className="bg-dark-700 border-b border-dark-600">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">Дата:</span>
                              <input type="date" value={editTranche.date} onChange={e => setEditTranche({ ...editTranche, date: e.target.value })} className="input py-1 text-sm w-36" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">Ставка, % год.:</span>
                              <input type="number" value={editTranche.rate} onChange={e => setEditTranche({ ...editTranche, rate: e.target.value })} className="input py-1 text-sm w-24" />
                            </div>
                            {partiallyPaid && (
                              <span className="text-xs text-gray-500">Сумма транша не редактируется — уже частично погашен</span>
                            )}
                            <button onClick={handleSaveTranche} className="btn-primary text-sm py-1 px-3">Сохранить</button>
                            <button onClick={() => setEditTranche(null)} className="btn-secondary text-sm py-1 px-3">Отмена</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Payment history — dad */}
      {debt.debt_type === 'dad' && (
        <div className="card p-0">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-base font-semibold">История платежей</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Платёж</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Текущие %</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Пул %</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Тело</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">В пул</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {dadPayments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">Платежей нет</td></tr>
              ) : dadPayments.map(p => (
                <React.Fragment key={p.id}>
                  <tr className="border-b border-dark-600 hover:bg-dark-700">
                    <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.payment_date)}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(p.total_amount)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(p.interest_covered)}</td>
                    <td className="px-5 py-3 text-sm text-right text-orange-400">{formatMoney(p.pool_covered)}</td>
                    <td className="px-5 py-3 text-sm text-right text-green-400">{formatMoney(p.body_covered)}</td>
                    <td className="px-5 py-3 text-sm text-right text-gray-400">
                      {p.overdue_added_to_pool > 0 ? <span className="text-red-400">+{formatMoney(p.overdue_added_to_pool)}</span> : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditDadPay({ id: p.id, date: p.payment_date, amount: String(p.total_amount) })} className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteDadPayment(p.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editDadPay?.id === p.id && (
                    <tr className="bg-dark-700 border-b border-dark-600">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-400">Дата:</span>
                          <input type="date" value={editDadPay.date} onChange={e => setEditDadPay({ ...editDadPay, date: e.target.value })} className="input py-1 text-sm w-36" />
                          <span className="text-sm text-gray-400">Сумма, ₽:</span>
                          <input type="number" value={editDadPay.amount} onChange={e => setEditDadPay({ ...editDadPay, amount: e.target.value })} className="input py-1 text-sm w-36" />
                          <span className="text-xs text-gray-500">Все последующие платежи пересчитаются автоматически</span>
                          <button onClick={handleSaveDadPayment} className="btn-primary text-sm py-1 px-3">Сохранить</button>
                          <button onClick={() => setEditDadPay(null)} className="btn-secondary text-sm py-1 px-3">Отмена</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Payment history — simple */}
      {debt.debt_type === 'simple' && (
        <div className="card p-0">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-base font-semibold">История платежей</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-gray-400 uppercase px-5 py-3">Дата</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Платёж</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Проценты</th>
                <th className="text-right text-xs text-gray-400 uppercase px-5 py-3">Тело</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {simplePayments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Платежей нет</td></tr>
              ) : simplePayments.map(p => (
                <React.Fragment key={p.id}>
                  <tr className="border-b border-dark-600 hover:bg-dark-700">
                    <td className="px-5 py-3 text-sm text-gray-300">{formatDate(p.payment_date)}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-white">{formatMoney(p.total_amount)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-400">{formatMoney(p.interest_part)}</td>
                    <td className="px-5 py-3 text-sm text-right text-green-400">{formatMoney(p.body_part)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setEditSimplePay({ id: p.id, date: p.payment_date, amount: String(p.total_amount), interestPart: String(p.interest_part) })}
                          className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteSimplePayment(p.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editSimplePay?.id === p.id && (
                    <tr className="bg-dark-700 border-b border-dark-600">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Дата:</span>
                            <input type="date" value={editSimplePay.date} onChange={e => setEditSimplePay({ ...editSimplePay, date: e.target.value })} className="input py-1 text-sm w-36" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Сумма:</span>
                            <input type="number" value={editSimplePay.amount} onChange={e => setEditSimplePay({ ...editSimplePay, amount: e.target.value })} className="input py-1 text-sm w-32" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Из них %:</span>
                            <input type="number" value={editSimplePay.interestPart} onChange={e => setEditSimplePay({ ...editSimplePay, interestPart: e.target.value })} className="input py-1 text-sm w-28" />
                          </div>
                          <button onClick={handleSaveSimplePayment} className="btn-primary text-sm py-1 px-3">Сохранить</button>
                          <button onClick={() => setEditSimplePay(null)} className="btn-secondary text-sm py-1 px-3">Отмена</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
