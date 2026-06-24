import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, Subcategory, Debt, SavingsAccount } from '../types'
import { today, formatMoney } from '../utils'

interface Props {
  onClose: () => void
  onSaved: () => void
  editOperation?: Record<string, unknown>
}

type OpType = 'income' | 'expense' | 'transfer' | 'debt_op'
type ExpenseType = 'daily' | 'big' | 'apartment'

export default function TransactionModal({ onClose, onSaved, editOperation }: Props) {
  const api = useApi()

  const [type, setType] = useState<OpType>((editOperation?.type as OpType) || 'expense')
  const [date, setDate] = useState<string>((editOperation?.date as string) || today())
  const [amount, setAmount] = useState<string>(editOperation?.amount ? String(editOperation.amount) : '')
  const [categoryId, setCategoryId] = useState<number | ''>(editOperation?.category_id as number || '')
  const [subcategoryId, setSubcategoryId] = useState<number | ''>(editOperation?.subcategory_id as number || '')
  const [expenseType, setExpenseType] = useState<ExpenseType>((editOperation?.expense_type as ExpenseType) || 'daily')
  const [comment, setComment] = useState<string>((editOperation?.comment as string) || '')
  const [debtId, setDebtId] = useState<number | ''>(editOperation?.debt_id as number || '')

  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [pendingAutoContrib, setPendingAutoContrib] = useState<Array<{ id: number; name: string; amount: number }>>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringDay, setRecurringDay] = useState(new Date().getDate())

  useEffect(() => {
    const catType = type === 'income' ? 'income' : 'expense'
    api.getCategories(catType).then(d => setCategories(d as Category[]))
    api.getDebts('active').then(d => setDebts(d as Debt[]))
  }, [type])

  useEffect(() => {
    if (categoryId) {
      api.getSubcategories(categoryId as number).then(d => setSubcategories(d as Subcategory[]))
    } else {
      setSubcategories([])
    }
    setSubcategoryId('')
  }, [categoryId])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!date) e.date = 'Укажите дату'
    if (!amount || parseFloat(amount) <= 0) e.amount = 'Укажите сумму'
    if (type === 'expense' && !categoryId) e.category = 'Выберите категорию'
    if (type === 'income' && !categoryId) e.category = 'Выберите источник дохода'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const op = {
        date,
        type,
        amount: parseFloat(amount),
        category_id: categoryId || null,
        subcategory_id: subcategoryId || null,
        expense_type: type === 'expense' ? expenseType : null,
        comment: comment || null,
        debt_id: type === 'debt_op' ? (debtId || null) : null,
      }
      if (editOperation?.id) {
        await api.updateOperation(editOperation.id as number, op)
        onSaved()
      } else {
        await api.addOperation(op)
        if (isRecurring && (type === 'expense' || type === 'income')) {
          await api.addRecurringOperation({
            type,
            amount: parseFloat(amount),
            category_id: categoryId || null,
            subcategory_id: subcategoryId || null,
            expense_type: type === 'expense' ? expenseType : null,
            day_of_month: recurringDay,
            comment: comment || null,
          })
        }
        if (type === 'income') {
          const accounts = await api.getAccountsForAutoContribute() as Array<{ id: number; name: string; auto_contribute_pct: number }>
          if (accounts.length > 0) {
            const incomeAmount = parseFloat(amount)
            const suggestions = accounts.map(a => ({ id: a.id, name: a.name, amount: Math.round(incomeAmount * a.auto_contribute_pct) }))
            setPendingAutoContrib(suggestions)
            return
          }
        }
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAutoContrib(accepted: Array<{ id: number; amount: number }>) {
    for (const a of accepted) {
      await api.addSavingsDeposit(a.id, a.amount, date, `Автопополнение от дохода`)
    }
    setPendingAutoContrib([])
    onSaved()
  }

  const opTypes: Array<{ id: OpType; label: string }> = [
    { id: 'expense', label: 'Расход' },
    { id: 'income', label: 'Доход' },
    { id: 'transfer', label: 'Перевод' },
    { id: 'debt_op', label: 'По долгу' },
  ]

  const expenseTypes: Array<{ id: ExpenseType; label: string }> = [
    { id: 'daily', label: 'Повседневный' },
    { id: 'big', label: 'Крупный' },
    { id: 'apartment', label: 'На квартиру' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-3xl w-full max-w-md mx-4 shadow-2xl border border-dark-500">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-white">
            {editOperation ? 'Редактировать операцию' : 'Новая операция'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {opTypes.map(t => (
              <button
                key={t.id}
                onClick={() => { setType(t.id); setCategoryId(''); setSubcategoryId('') }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  type === t.id
                    ? 'bg-yellow-400 text-dark-900'
                    : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Date & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Дата</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="input"
              />
              {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="label">Сумма, ₽</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="input"
              />
              {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
            </div>
          </div>

          {/* Category (for expense/income) */}
          {(type === 'expense' || type === 'income') && (
            <div>
              <label className="label">{type === 'income' ? 'Источник дохода' : 'Категория'}</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                className="select"
              >
                <option value="">— Выберите —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category}</p>}
            </div>
          )}

          {/* Subcategory */}
          {subcategories.length > 0 && (
            <div>
              <label className="label">Подкатегория</label>
              <select
                value={subcategoryId}
                onChange={e => setSubcategoryId(e.target.value ? Number(e.target.value) : '')}
                className="select"
              >
                <option value="">— Не выбрано —</option>
                {subcategories.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Expense type */}
          {type === 'expense' && (
            <div>
              <label className="label">Тип расхода</label>
              <div className="flex gap-2">
                {expenseTypes.map(et => (
                  <button
                    key={et.id}
                    onClick={() => setExpenseType(et.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                      expenseType === et.id
                        ? 'bg-dark-500 text-yellow-400 border border-yellow-400'
                        : 'bg-dark-700 text-gray-400 hover:text-white border border-dark-600'
                    }`}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Debt selector */}
          {type === 'debt_op' && (
            <div>
              <label className="label">Долг</label>
              <select
                value={debtId}
                onChange={e => setDebtId(e.target.value ? Number(e.target.value) : '')}
                className="select"
              >
                <option value="">— Выберите долг —</option>
                {debts.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Recurring */}
          {!editOperation && (type === 'expense' || type === 'income') && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                <span className="text-sm text-gray-300">Повторять ежемесячно</span>
              </label>
              {isRecurring && (
                <div>
                  <label className="label">День месяца</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recurringDay}
                    onChange={e => setRecurringDay(Number(e.target.value))}
                    className="input w-24"
                  />
                </div>
              )}
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="label">Комментарий</label>
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Необязательно"
              className="input"
            />
          </div>

          {/* Auto-contribute prompt */}
          {pendingAutoContrib.length > 0 && (
            <div className="bg-dark-700 border border-yellow-400/30 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-yellow-400">Автопополнение накоплений</p>
              {pendingAutoContrib.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm text-gray-300">
                  <span>{a.name}</span>
                  <span className="font-semibold text-white">{formatMoney(a.amount)}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleAutoContrib(pendingAutoContrib)} className="btn-primary flex-1 text-sm">Применить</button>
                <button onClick={() => { setPendingAutoContrib([]); onSaved() }} className="btn-secondary flex-1 text-sm">Пропустить</button>
              </div>
            </div>
          )}

          {/* Actions */}
          {pendingAutoContrib.length === 0 && (
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1">
                Отмена
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Сохранение...' : editOperation ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
