import React, { useEffect, useState } from 'react'
import { useApi } from './hooks/useApi'
import {
  LayoutDashboard, ListOrdered, TrendingUp, CreditCard, Settings, Plus, PiggyBank, BarChart3
} from 'lucide-react'
import { Page } from './types'
import Dashboard from './pages/Dashboard'
import Operations from './pages/Operations'
import CashFlow from './pages/CashFlow'
import Debts from './pages/Debts'
import DebtDetail from './pages/DebtDetail'
import DebtForecast from './pages/DebtForecast'
import DebtAnalytics from './pages/DebtAnalytics'
import Savings from './pages/Savings'
import SavingsDetail from './pages/SavingsDetail'
import SavingsForecast from './pages/SavingsForecast'
import Reports from './pages/Reports'
import SettingsPage from './pages/SettingsPage'
import TransactionModal from './components/TransactionModal'
import PinLock from './components/PinLock'

const navItems = [
  { id: 'dashboard' as Page, label: 'Дашборд', icon: LayoutDashboard },
  { id: 'operations' as Page, label: 'Операции', icon: ListOrdered },
  { id: 'cashflow' as Page, label: 'Кассовый поток', icon: TrendingUp },
  { id: 'debts' as Page, label: 'Долги', icon: CreditCard },
  { id: 'savings' as Page, label: 'Накопления', icon: PiggyBank },
  { id: 'reports' as Page, label: 'Отчёты', icon: BarChart3 },
  { id: 'settings' as Page, label: 'Настройки', icon: Settings },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null)
  const [selectedSavingsId, setSelectedSavingsId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [operationsFilter, setOperationsFilter] = useState<{ categoryId?: number; noCategory?: boolean; noSubcategory?: boolean; subcategoryId?: number; type?: string; dateFrom?: string; dateTo?: string } | null>(null)
  const [unlocked, setUnlocked] = useState(() => !localStorage.getItem('ucet-pin'))

  // Горячие клавиши (Этап 7.12)
  useEffect(() => {
    const pageOrder: Page[] = ['dashboard', 'operations', 'cashflow', 'debts', 'savings', 'reports']
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowAddModal(true) }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setPage('operations') }
      else if (e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        const p = pageOrder[parseInt(e.key) - 1]
        if (p) setPage(p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!unlocked) return <PinLock onUnlock={() => setUnlocked(true)} />

  function navigateToFilteredOperations(filter: typeof operationsFilter) {
    setOperationsFilter(filter)
    setPage('operations')
  }

  function handleRefresh() {
    setRefreshKey(k => k + 1)
  }

  function navigateToDebt(id: number) {
    setSelectedDebtId(id)
    setPage('debt-detail')
  }

  function navigateToForecast(id: number) {
    setSelectedDebtId(id)
    setPage('debt-forecast')
  }

  function navigateToSavings(id: number) {
    setSelectedSavingsId(id)
    setPage('savings-detail')
  }

  function navigateToSavingsForecast(id: number) {
    setSelectedSavingsId(id)
    setPage('savings-forecast')
  }

  function navigateToAnalytics(id: number) {
    setSelectedDebtId(id)
    setPage('debt-analytics')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col py-6 px-3">
        {/* Logo */}
        <div className="px-2 mb-8">
          <span className="text-yellow-400 font-bold text-xl tracking-tight">учёт</span>
          <span className="text-gray-500 font-bold text-xl tracking-tight">.финансы</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`nav-item text-left ${page === item.id || (page === 'debt-detail' && item.id === 'debts') || (page === 'debt-forecast' && item.id === 'debts') || (page === 'debt-analytics' && item.id === 'debts') || (page === 'savings-detail' && item.id === 'savings') || (page === 'savings-forecast' && item.id === 'savings') ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Add operation button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center justify-center gap-2 mt-4"
        >
          <Plus size={18} />
          Операция
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {page === 'dashboard' && <Dashboard key={refreshKey} onNavigateToOperations={navigateToFilteredOperations} onNavigateToSavings={(id) => id ? navigateToSavings(id) : setPage('savings')} />}
        {page === 'operations' && <Operations key={refreshKey} onAdd={() => setShowAddModal(true)} initialFilter={operationsFilter} onInitialFilterApplied={() => setOperationsFilter(null)} />}
        {page === 'cashflow' && <CashFlow key={refreshKey} onGoToDebt={navigateToDebt} />}
        {page === 'debts' && (
          <Debts
            key={refreshKey}
            onOpenDebt={navigateToDebt}
            onOpenForecast={navigateToForecast}
          />
        )}
        {page === 'debt-detail' && selectedDebtId && (
          <DebtDetail
            key={selectedDebtId}
            debtId={selectedDebtId}
            onBack={() => setPage('debts')}
            onForecast={() => navigateToForecast(selectedDebtId)}
            onAnalytics={() => navigateToAnalytics(selectedDebtId)}
          />
        )}
        {page === 'debt-analytics' && selectedDebtId && (
          <DebtAnalytics
            key={selectedDebtId}
            debtId={selectedDebtId}
            onBack={() => navigateToDebt(selectedDebtId)}
          />
        )}
        {page === 'debt-forecast' && selectedDebtId && (
          <DebtForecast
            key={selectedDebtId}
            debtId={selectedDebtId}
            onBack={() => { selectedDebtId && navigateToDebt(selectedDebtId) }}
          />
        )}
        {page === 'savings' && (
          <Savings
            key={refreshKey}
            onOpenAccount={navigateToSavings}
            onOpenForecast={navigateToSavingsForecast}
          />
        )}
        {page === 'savings-detail' && selectedSavingsId && (
          <SavingsDetail
            key={selectedSavingsId}
            accountId={selectedSavingsId}
            onBack={() => setPage('savings')}
            onForecast={() => navigateToSavingsForecast(selectedSavingsId)}
          />
        )}
        {page === 'savings-forecast' && selectedSavingsId && (
          <SavingsForecast
            key={selectedSavingsId}
            accountId={selectedSavingsId}
            onBack={() => navigateToSavings(selectedSavingsId)}
          />
        )}
        {page === 'reports' && <Reports key={refreshKey} />}
        {page === 'settings' && <SettingsPage key={refreshKey} />}
      </main>

      {/* Universal add modal */}
      {showAddModal && (
        <TransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); handleRefresh() }}
          onGoToDebts={() => { setShowAddModal(false); setPage('debts') }}
        />
      )}

      {/* Разовая разметка исторических досрочных платежей (ТЗ #18, Б12) */}
      <EarlyPaymentMarkupModal onDone={handleRefresh} />

      {/* Ненавязчивый индикатор скачанного обновления */}
      <UpdateReadyBadge />
    </div>
  )
}

function UpdateReadyBadge() {
  const api = useApi()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = api.onUpdaterStatus?.(payload => {
      if (payload.status === 'downloaded') setVersion(String(payload.version ?? ''))
    })
    return () => { unsubscribe?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!version) return null
  return (
    <button
      onClick={() => api.updaterInstall()}
      className="fixed bottom-4 right-4 z-40 bg-yellow-400 text-dark-900 rounded-xl px-4 py-2 text-sm font-medium shadow-lg hover:bg-yellow-300"
      title="Обновление скачано — нажмите, чтобы перезапустить и установить"
    >
      Обновление {version} готово — перезапустить
    </button>
  )
}

function EarlyPaymentMarkupModal({ onDone }: { onDone: () => void }) {
  const api = useApi()
  const [candidates, setCandidates] = useState<Array<{
    id: number; debt_name: string; payment_date: string; total_amount: number; monthly_payment: number
  }>>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    api.getEarlyPaymentCandidates().then(list => {
      const c = list as typeof candidates
      if (c.length > 0) {
        setCandidates(c)
        setChecked(new Set(c.map(p => p.id)))
        setVisible(true)
      }
    }).catch(() => { /* старая схема БД */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function apply(ids: number[]) {
    await api.markPaymentsEarly(ids)
    setVisible(false)
    if (ids.length > 0) onDone()
  }

  if (!visible) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-3xl w-full max-w-lg mx-4 shadow-2xl border border-dark-500 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Разметка досрочных платежей</h2>
        <p className="text-sm text-gray-400">
          После обновления все прошлые платежи помечены как «обязательные». Эти платежи существенно
          превышают ежемесячный платёж по долгу — вероятно, это досрочные погашения. Отметьте, какие
          из них пометить как досрочные:
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {candidates.map(p => (
            <label key={p.id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked.has(p.id)}
                onChange={e => {
                  setChecked(prev => {
                    const s = new Set(prev)
                    if (e.target.checked) s.add(p.id); else s.delete(p.id)
                    return s
                  })
                }}
                className="w-4 h-4 accent-yellow-400"
              />
              <div className="flex-1 text-sm">
                <span className="text-white">{p.debt_name}</span>
                <span className="text-gray-500"> · {p.payment_date}</span>
              </div>
              <span className="text-sm font-semibold text-white">{p.total_amount.toLocaleString('ru-RU')} ₽</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => apply([])} className="btn-secondary flex-1">Оставить как есть</button>
          <button onClick={() => apply([...checked])} disabled={checked.size === 0} className="btn-primary flex-1">
            Пометить выбранные как досрочные
          </button>
        </div>
      </div>
    </div>
  )
}
