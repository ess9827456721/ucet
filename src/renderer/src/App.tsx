import React, { useState } from 'react'
import {
  LayoutDashboard, ListOrdered, TrendingUp, CreditCard, Settings, Plus
} from 'lucide-react'
import { Page } from './types'
import Dashboard from './pages/Dashboard'
import Operations from './pages/Operations'
import CashFlow from './pages/CashFlow'
import Debts from './pages/Debts'
import DebtDetail from './pages/DebtDetail'
import DebtForecast from './pages/DebtForecast'
import DebtAnalytics from './pages/DebtAnalytics'
import SettingsPage from './pages/SettingsPage'
import TransactionModal from './components/TransactionModal'

const navItems = [
  { id: 'dashboard' as Page, label: 'Дашборд', icon: LayoutDashboard },
  { id: 'operations' as Page, label: 'Операции', icon: ListOrdered },
  { id: 'cashflow' as Page, label: 'Кассовый поток', icon: TrendingUp },
  { id: 'debts' as Page, label: 'Долги', icon: CreditCard },
  { id: 'settings' as Page, label: 'Настройки', icon: Settings },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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
              className={`nav-item text-left ${page === item.id || (page === 'debt-detail' && item.id === 'debts') || (page === 'debt-forecast' && item.id === 'debts') || (page === 'debt-analytics' && item.id === 'debts') ? 'active' : ''}`}
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
        {page === 'dashboard' && <Dashboard key={refreshKey} />}
        {page === 'operations' && <Operations key={refreshKey} onAdd={() => setShowAddModal(true)} />}
        {page === 'cashflow' && <CashFlow key={refreshKey} />}
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
        {page === 'settings' && <SettingsPage key={refreshKey} />}
      </main>

      {/* Universal add modal */}
      {showAddModal && (
        <TransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); handleRefresh() }}
        />
      )}
    </div>
  )
}
