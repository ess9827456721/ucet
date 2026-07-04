import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SavingsAccount } from '../types'
import { today } from '../utils'

interface Props {
  editAccount?: SavingsAccount | null
  onClose: () => void
  onSaved: () => void
  focusGoal?: boolean
}

const COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export default function AddSavingsAccountModal({ editAccount, onClose, onSaved, focusGoal }: Props) {
  const api = useApi()
  const [name, setName] = useState(editAccount?.name ?? '')
  const [rate, setRate] = useState(editAccount ? String((editAccount.interest_rate * 100).toFixed(2)) : '')
  const [mode, setMode] = useState<'capitalize' | 'payout'>(editAccount?.interest_mode as 'capitalize' | 'payout' ?? 'capitalize')
  const [period, setPeriod] = useState<'daily' | 'monthly'>(editAccount?.payout_period as 'daily' | 'monthly' ?? 'monthly')
  const [goalName, setGoalName] = useState(editAccount?.goal_name ?? '')
  const [goalAmount, setGoalAmount] = useState(editAccount?.goal_amount ? String(editAccount.goal_amount) : '')
  const [goalDate, setGoalDate] = useState(editAccount?.goal_date ?? '')
  const [autoContrib, setAutoContrib] = useState(editAccount?.auto_contribute_pct ? String((editAccount.auto_contribute_pct * 100).toFixed(1)) : '')
  const [autoContribEnabled, setAutoContribEnabled] = useState(!!(editAccount?.auto_contribute_pct))
  const [notifyEnabled, setNotifyEnabled] = useState(!!(editAccount?.notify_contribution))
  const [notifyDay, setNotifyDay] = useState(editAccount?.notify_day ? String(editAccount.notify_day) : '')
  const [initialBalance, setInitialBalance] = useState('')
  const [openedAt, setOpenedAt] = useState(editAccount?.opened_at ?? today())
  const [color, setColor] = useState(editAccount?.color ?? '#22C55E')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const goalSectionOpen = focusGoal || !!(editAccount?.goal_name)

  async function handleSave() {
    if (!name.trim()) { setError('Введите название счёта'); return }
    if (!rate || parseFloat(rate) <= 0) { setError('Укажите процентную ставку'); return }
    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        interest_rate: parseFloat(rate) / 100,
        interest_mode: mode,
        payout_period: period,
        goal_name: goalName.trim() || null,
        goal_amount: goalAmount ? parseFloat(goalAmount) : null,
        goal_date: goalDate || null,
        auto_contribute_pct: autoContribEnabled && autoContrib ? parseFloat(autoContrib) / 100 : null,
        notify_contribution: notifyEnabled ? 1 : 0,
        notify_day: notifyEnabled && notifyDay ? parseInt(notifyDay) : null,
        color,
        opened_at: openedAt,
        initial_balance: editAccount ? undefined : (initialBalance ? parseFloat(initialBalance) : undefined),
      }
      if (editAccount) {
        await api.updateSavingsAccount(editAccount.id, data)
      } else {
        await api.addSavingsAccount(data)
      }
      onSaved()
    } catch {
      setError('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <h2 className="text-lg font-semibold text-white">{editAccount ? 'Редактировать счёт' : 'Открыть накопительный счёт'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Goal section (first when focusGoal) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Цель накопления</h3>
            {goalSectionOpen && (
              <p className="text-xs text-gray-500 mb-3">Для каждой цели открывается отдельный накопительный счёт. Укажите цель — и приложение покажет прогресс.</p>
            )}
            <div className="space-y-3">
              <div>
                <label className="label">Название цели (необязательно)</label>
                <input type="text" value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="На машину, Подушка безопасности..." className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Сумма цели, ₽</label>
                  <input type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Дата цели</label>
                  <input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} className="input" />
                </div>
              </div>
            </div>
          </div>

          {/* Account params */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Параметры счёта</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Название счёта *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Подушка безопасности" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ставка, % годовых *</label>
                  <input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} placeholder="16" className="input" />
                </div>
                <div>
                  <label className="label">Дата открытия</label>
                  <input type="date" value={openedAt} onChange={e => setOpenedAt(e.target.value)} className="input" />
                </div>
              </div>

              <div>
                <label className="label">Режим процентов</label>
                <div className="flex gap-2">
                  {(['capitalize', 'payout'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${mode === m ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-dark-500 text-gray-400 hover:border-dark-400'}`}>
                      {m === 'capitalize' ? 'Капитализация' : 'Выплата в бюджет'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Начисление</label>
                <div className="flex gap-2">
                  {(['daily', 'monthly'] as const).map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${period === p ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-dark-500 text-gray-400 hover:border-dark-400'}`}>
                      {p === 'daily' ? 'Ежедневно' : 'Ежемесячно'}
                    </button>
                  ))}
                </div>
              </div>

              {!editAccount && (
                <div>
                  <label className="label">Начальный баланс, ₽ (необязательно)</label>
                  <input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} placeholder="0" className="input" />
                </div>
              )}

              {/* Auto-contribute */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={autoContribEnabled} onChange={e => setAutoContribEnabled(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                  <span className="text-sm text-gray-300">При получении дохода откладывать X%</span>
                </label>
                {autoContribEnabled && (
                  <div className="flex items-center gap-2 ml-6">
                    <input type="number" min="0" max="100" step="0.5" value={autoContrib} onChange={e => setAutoContrib(e.target.value)} placeholder="10" className="input w-24" />
                    <span className="text-sm text-gray-400">% от дохода</span>
                  </div>
                )}
              </div>

              {/* Notify */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={notifyEnabled} onChange={e => setNotifyEnabled(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                  <span className="text-sm text-gray-300">Напоминать пополнить X-го числа каждого месяца</span>
                </label>
                {notifyEnabled && (
                  <div className="flex items-center gap-2 ml-6">
                    <input type="number" min="1" max="28" value={notifyDay} onChange={e => setNotifyDay(e.target.value)} placeholder="1" className="input w-24" />
                    <span className="text-sm text-gray-400">число месяца</span>
                  </div>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="label">Цвет карточки</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Сохранение...' : (editAccount ? 'Сохранить' : 'Открыть счёт')}
          </button>
        </div>
      </div>
    </div>
  )
}
