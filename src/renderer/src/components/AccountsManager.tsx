import React, { useEffect, useState } from 'react'
import { Plus, Archive, Pencil, Check, X as XIcon, Wallet } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Account } from '../types'
import { formatMoney } from '../utils'

export default function AccountsManager({ onChanged }: { onChanged?: () => void }) {
  const api = useApi()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [newName, setNewName] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [edit, setEdit] = useState<{ id: number; name: string; initial_balance: string } | null>(null)

  async function load() {
    setAccounts(await api.getAccounts() as Account[])
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!newName.trim()) return
    await api.addAccount({ name: newName.trim(), initial_balance: parseFloat(newBalance) || 0 })
    setNewName(''); setNewBalance('')
    load(); onChanged?.()
  }

  async function saveEdit() {
    if (!edit || !edit.name.trim()) return
    await api.updateAccount(edit.id, { name: edit.name.trim(), initial_balance: parseFloat(edit.initial_balance) || 0 })
    setEdit(null); load(); onChanged?.()
  }

  async function archive(id: number) {
    if (accounts.length <= 1) { alert('Нельзя архивировать единственный счёт'); return }
    if (!confirm('Архивировать счёт? Операции сохранятся в журнале.')) return
    await api.updateAccount(id, { archived: 1 })
    load(); onChanged?.()
  }

  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-yellow-400" />
        <h2 className="text-base font-semibold text-white">Счета и кошельки</h2>
        <span className="ml-auto text-sm text-gray-400">Всего: <span className="text-white font-semibold">{formatMoney(total)}</span></span>
      </div>

      <div className="space-y-1">
        {accounts.map(a => (
          <div key={a.id}>
            {edit?.id === a.id ? (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-dark-600 border border-yellow-400/30">
                <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className="input py-0.5 text-sm flex-1 h-7" autoFocus />
                <input type="number" value={edit.initial_balance} onChange={e => setEdit({ ...edit, initial_balance: e.target.value })}
                  className="input py-0.5 text-sm w-32 h-7" placeholder="Нач. остаток" />
                <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1"><Check size={14} /></button>
                <button onClick={() => setEdit(null)} className="text-gray-500 hover:text-white p-1"><XIcon size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-700 group">
                <span className="flex-1 text-sm text-white">{a.name}</span>
                <span className={`text-sm font-medium ${a.balance >= 0 ? 'text-white' : 'text-red-400'}`}>{formatMoney(a.balance)}</span>
                <button onClick={() => setEdit({ id: a.id, name: a.name, initial_balance: String(a.initial_balance) })}
                  className="text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100" title="Изменить"><Pencil size={13} /></button>
                <button onClick={() => archive(a.id)} className="text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100" title="Архивировать"><Archive size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-3 border-t border-dark-600">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название счёта" className="input flex-1" />
        <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="Нач. остаток, ₽" className="input w-40" />
        <button onClick={add} className="btn-primary flex items-center gap-2"><Plus size={16} /> Добавить</button>
      </div>
      <p className="text-xs text-gray-500">
        Начальный остаток — сумма, которая уже была на счёте до начала учёта. Общий баланс счёта = начальный остаток
        плюс все доходы, минус расходы и платежи, с учётом переводов.
      </p>
    </div>
  )
}
