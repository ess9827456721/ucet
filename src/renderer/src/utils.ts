export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function monthEnd(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

export function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.toISOString().slice(0, 10)

  switch (period) {
    case 'day':
      return { from: d, to: d }
    case 'week': {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay() + 1)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
    }
    case 'month':
      return { from: monthStart(y, m), to: monthEnd(y, m) }
    case 'quarter': {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1
      return { from: monthStart(y, qStart), to: monthEnd(y, qStart + 2) }
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    default:
      return { from: monthStart(y, m), to: monthEnd(y, m) }
  }
}

export function expenseTypeLabel(type: string | null): string {
  switch (type) {
    case 'daily': return 'Повседневный'
    case 'big': return 'Крупный'
    case 'apartment': return 'На квартиру'
    default: return '—'
  }
}

export function operationTypeLabel(type: string): string {
  switch (type) {
    case 'income': return 'Доход'
    case 'expense': return 'Расход'
    case 'transfer': return 'Перевод'
    case 'debt_op': return 'Операция по долгу'
    default: return type
  }
}

export function nextPaymentDate(paymentDay: number): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(paymentDay, lastDay)
  const d = new Date(year, month - 1, day)
  if (d <= now) {
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year
    const lastDayNext = new Date(nextY, nextM, 0).getDate()
    const dayNext = Math.min(paymentDay, lastDayNext)
    return `${nextY}-${String(nextM).padStart(2, '0')}-${String(dayNext).padStart(2, '0')}`
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isOverdue(paymentDay: number): boolean {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(paymentDay, lastDay)
  const payDate = new Date(year, month - 1, day)
  return payDate < now
}
