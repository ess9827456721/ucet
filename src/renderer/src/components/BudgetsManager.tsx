import React, { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Category, CategoryBudget } from '../types'
import { formatMoney } from '../utils'

export default function BudgetsManager() {
  const api = useApi()
  const [cats, setCats] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<CategoryBudget[]>([])
  const now = new Date()

  async function load() {
    const [c, b] = await Promise.all([
      api.getCategories('expense'),
      api.getCategoryBudgets(now.getFullYear(), now.getMonth() + 1),
    ])
    setCats(c as Category[])
    setBudgets(b as CategoryBudget[])
  }
  useEffect(() => { load() }, [])

  const budgetByCat = new Map(budgets.map(b => [b.category_id, b]))

  async function setBudget(categoryId: number, limit: number | null, rollover: boolean) {
    await api.setCategoryBudget(categoryId, limit, rollover)
    load()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-yellow-400" />
        <h2 className="text-base font-semibold text-white">Бюджеты по категориям (месяц)</h2>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
        {cats.map(c => {
          const b = budgetByCat.get(c.id)
          return (
            <div key={c.id} className="flex items-center gap-3 py-1">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className="flex-1 text-sm text-white">{c.name}</span>
              {b && <span className="text-xs text-gray-500">потрачено {formatMoney(b.spent)}</span>}
              <input
                type="number"
                defaultValue={b?.monthly_limit ?? ''}
                onBlur={e => {
                  const v = parseFloat(e.target.value)
                  setBudget(c.id, isNaN(v) ? null : v, b?.rollover === 1)
                }}
                placeholder="Лимит, ₽"
                className="input w-32 py-1 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Переносить неистраченный остаток на следующий месяц">
                <input
                  type="checkbox"
                  checked={b?.rollover === 1}
                  disabled={!b}
                  onChange={e => b && setBudget(c.id, b.monthly_limit, e.target.checked)}
                  className="w-3.5 h-3.5 accent-yellow-400"
                />
                перенос
              </label>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-500">Оставьте лимит пустым (0), чтобы убрать бюджет по категории. Прогресс-бары видны на дашборде.</p>
    </div>
  )
}
