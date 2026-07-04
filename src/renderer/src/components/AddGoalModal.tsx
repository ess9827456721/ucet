import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SavingsGoal } from '../types'

interface Props {
  editGoal?: SavingsGoal
  onClose: () => void
  onSaved: () => void
}

const GOAL_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#EF4444']

export default function AddGoalModal({ editGoal, onClose, onSaved }: Props) {
  const api = useApi()
  const [name, setName] = useState(editGoal?.name ?? '')
  const [targetAmount, setTargetAmount] = useState(editGoal ? String(editGoal.target_amount) : '')
  const [currentAmount, setCurrentAmount] = useState(editGoal ? String(editGoal.current_amount) : '0')
  const [color, setColor] = useState(editGoal?.color ?? '#22C55E')
  const [targetDate, setTargetDate] = useState(editGoal?.target_date ?? '')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Укажите название'
    if (!targetAmount || parseFloat(targetAmount) <= 0) e.target = 'Укажите целевую сумму'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      if (editGoal) {
        await api.updateSavingsGoal(editGoal.id, {
          name: name.trim(),
          target_amount: parseFloat(targetAmount),
          current_amount: parseFloat(currentAmount) || 0,
          color,
          target_date: targetDate || null,
        })
      } else {
        await api.addSavingsGoal({
          name: name.trim(),
          target_amount: parseFloat(targetAmount),
          color,
          target_date: targetDate || null,
        })
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-3xl w-full max-w-md mx-4 shadow-2xl border border-dark-500">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-white">{editGoal ? 'Редактировать цель' : 'Новая цель накопления'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={20} /></button>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="label">Название цели</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Например, Новый ноутбук" className="input" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Целевая сумма, ₽</label>
              <input type="number" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} placeholder="0" className="input" />
              {errors.target && <p className="text-red-400 text-xs mt-1">{errors.target}</p>}
            </div>
            {editGoal && (
              <div>
                <label className="label">Накоплено, ₽</label>
                <input type="number" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} placeholder="0" className="input" />
              </div>
            )}
            <div>
              <label className="label">Дата цели (необяз.)</label>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Цвет</label>
            <div className="flex gap-2 flex-wrap">
              {GOAL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-800 scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Сохранение...' : editGoal ? 'Сохранить' : 'Создать цель'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
