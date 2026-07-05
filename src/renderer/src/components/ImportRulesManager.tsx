import React, { useEffect, useState } from 'react'
import { Trash2, Filter } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { ImportRule } from '../types'
import { formatMoney } from '../utils'

export default function ImportRulesManager() {
  const api = useApi()
  const [rules, setRules] = useState<ImportRule[]>([])

  async function load() {
    setRules(await api.getImportRules() as ImportRule[])
  }
  useEffect(() => { load() }, [])

  async function remove(id: number) {
    await api.deleteImportRule(id)
    load()
  }

  if (rules.length === 0) {
    return (
      <div className="card space-y-2">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-yellow-400" />
          <h2 className="text-base font-semibold text-white">Правила категоризации импорта</h2>
        </div>
        <p className="text-sm text-gray-500">
          Правил пока нет. Они создаются автоматически при импорте выписки, когда вы сопоставляете
          описание операции с категорией — в следующий раз такая операция подставится сама.
        </p>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-yellow-400" />
        <h2 className="text-base font-semibold text-white">Правила категоризации импорта</h2>
        <span className="badge bg-dark-600 text-gray-300">{rules.length}</span>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
        {rules.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-700 group text-sm">
            <span className="text-gray-300 font-mono">«{r.pattern}»</span>
            <span className="text-gray-500">→</span>
            <span className="text-white">{r.category_name ?? 'без категории'}</span>
            {r.split_amount != null && r.split_category_name && (
              <span className="text-xs text-blue-400">(сплит {formatMoney(r.split_amount)} → {r.split_category_name})</span>
            )}
            <button onClick={() => remove(r.id)} className="ml-auto text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
