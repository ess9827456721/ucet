import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Debt } from '../types'
import { today } from '../utils'

interface Props {
  onClose: () => void
  onSaved: () => void
  editDebt?: Debt
}

export default function AddDebtModal({ onClose, onSaved, editDebt }: Props) {
  const api = useApi()
  const isEdit = !!editDebt

  const [name, setName] = useState(editDebt?.name ?? '')
  const [category, setCategory] = useState(editDebt?.category ?? '')
  const [direction, setDirection] = useState<'i_owe' | 'owe_me'>(editDebt?.direction ?? 'i_owe')
  const [debtType, setDebtType] = useState<'simple' | 'dad'>(editDebt?.debt_type ?? 'simple')
  const [initialAmount, setInitialAmount] = useState(editDebt?.initial_amount != null ? String(editDebt.initial_amount) : '')
  const [interestRate, setInterestRate] = useState(editDebt?.interest_rate != null ? String((editDebt.interest_rate * 100).toFixed(2)) : '')
  const [paymentDay, setPaymentDay] = useState(editDebt?.payment_day != null ? String(editDebt.payment_day) : '')
  const [monthlyPayment, setMonthlyPayment] = useState(editDebt?.monthly_payment != null ? String(editDebt.monthly_payment) : '')
  const [loanDate, setLoanDate] = useState(editDebt?.loan_date ?? today())
  // For new dad debt only — first tranche
  const [trancheDate, setTrancheDate] = useState(today())
  const [trancheAmount, setTrancheAmount] = useState('')
  const [trancheRate, setTrancheRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existingCategories, setExistingCategories] = useState<string[]>([])

  useEffect(() => {
    api.getDebtsWithBalance().then(debts => {
      const cats = [...new Set((debts as Debt[]).map(d => d.category).filter(Boolean))] as string[]
      setExistingCategories(cats)
    })
  }, [])

  async function handleSave() {
    if (!name.trim()) { setError('Укажите имя/название долга'); return }
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.updateDebt(editDebt!.id, {
          name,
          category: category.trim() || null,
          direction,
          initial_amount: initialAmount ? parseFloat(initialAmount) : null,
          interest_rate: interestRate ? parseFloat(interestRate) / 100 : null,
          payment_day: paymentDay ? parseInt(paymentDay) : null,
          monthly_payment: monthlyPayment ? parseFloat(monthlyPayment) : null,
          loan_date: editDebt?.debt_type === 'simple' ? (loanDate || null) : undefined,
        })
      } else if (debtType === 'dad') {
        if (!trancheAmount || !trancheRate) { setError('Укажите сумму и ставку транша'); setSaving(false); return }
        const debtId = await api.addDebt({
          name, category: category.trim() || null, direction, debt_type: 'dad',
          initial_amount: parseFloat(trancheAmount),
          interest_rate: parseFloat(trancheRate) / 100,
          payment_day: paymentDay ? parseInt(paymentDay) : 30,
        })
        await api.addTranche({
          debt_id: debtId,
          date: trancheDate,
          initial_amount: parseFloat(trancheAmount),
          interest_rate: parseFloat(trancheRate) / 100,
        })
      } else {
        if (!initialAmount) { setError('Укажите сумму долга'); setSaving(false); return }
        await api.addDebt({
          name, category: category.trim() || null, direction, debt_type: 'simple',
          initial_amount: parseFloat(initialAmount),
          interest_rate: interestRate ? parseFloat(interestRate) / 100 : null,
          payment_day: paymentDay ? parseInt(paymentDay) : null,
          monthly_payment: monthlyPayment ? parseFloat(monthlyPayment) : null,
          loan_date: loanDate || null,
        })
      }
      onSaved()
    } catch {
      setError('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-3xl w-full max-w-md mx-4 shadow-2xl border border-dark-500">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Редактировать долг' : 'Новый долг'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="label">Имя / Название</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Папа, Альфабанк..." className="input" />
          </div>

          <div>
            <label className="label">Категория (необязательно)</label>
            <input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Банк, Родственники..."
              list="debt-categories-list"
              className="input"
            />
            <datalist id="debt-categories-list">
              {existingCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Направление</label>
              <div className="flex gap-2">
                {[['i_owe', 'Я должен'], ['owe_me', 'Мне должны']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setDirection(v as 'i_owe' | 'owe_me')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${direction === v ? 'bg-yellow-400 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="label">Тип долга</label>
              <div className="flex gap-2">
                {[['simple', 'Обычный'], ['dad', 'Сложный (несколько траншей)']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setDebtType(v as 'simple' | 'dad')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${debtType === v ? 'bg-yellow-400 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(isEdit ? editDebt?.debt_type === 'simple' : debtType === 'simple') ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Дата получения</label>
                  <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Сумма долга, ₽</label>
                  <input type="number" value={initialAmount} onChange={e => setInitialAmount(e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ставка, % год.</label>
                  <input type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="0" className="input" />
                </div>
                <div>
                  <label className="label">День платежа (число месяца)</label>
                  <input type="number" value={paymentDay} onChange={e => setPaymentDay(e.target.value)} placeholder="30" min="1" max="31" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Ежемесячный платёж, ₽</label>
                <input type="number" value={monthlyPayment} onChange={e => setMonthlyPayment(e.target.value)} className="input" />
              </div>
            </>
          ) : !isEdit ? (
            <>
              <p className="text-xs text-gray-500">Первый транш. Следующие можно добавить в карточке долга.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Дата получения</label>
                  <input type="date" value={trancheDate} onChange={e => setTrancheDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Сумма транша, ₽</label>
                  <input type="number" value={trancheAmount} onChange={e => setTrancheAmount(e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ставка транша, % год.</label>
                  <input type="number" value={trancheRate} onChange={e => setTrancheRate(e.target.value)} placeholder="38.3" className="input" />
                </div>
                <div>
                  <label className="label">День платежа</label>
                  <input type="number" value={paymentDay} onChange={e => setPaymentDay(e.target.value)} placeholder="30" min="1" max="31" className="input" />
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Редактирование траншей — в карточке долга.</p>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
