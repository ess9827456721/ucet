export interface Tranche {
  id: number
  currentBalance: number
  interestRate: number // decimal, e.g. 0.383
  status: 'active' | 'paid'
  daysSinceInterestStart?: number // per-tranche override; falls back to daysSinceLastPayment
  date?: string // YYYY-MM-DD, used for earliest_first ordering
}

export interface TrancheUpdate {
  id: number
  newBalance: number
  status: 'active' | 'paid'
}

export interface DadDebtSettings {
  tranchePayoffOrder: 'highest_rate' | 'smallest_balance' | 'earliest_first' | 'proportional'
  poolRatio: number // 0.0 – 1.0
}

export const DEFAULT_SETTINGS: DadDebtSettings = { tranchePayoffOrder: 'highest_rate', poolRatio: 0.5 }

export interface PaymentResult {
  interestCovered: number
  poolCovered: number
  bodyCovered: number
  overdueAddedToPool: number
  newOverduePool: number
  overpayment: number           // остаток после полного погашения всех траншей
  trancheUpdates: TrancheUpdate[]
}

export function calculateDadDebtPayment(
  tranches: Tranche[],
  overduePool: number,
  paymentAmount: number,
  daysSinceLastPayment: number,
  settings: DadDebtSettings = DEFAULT_SETTINGS
): PaymentResult {
  const activeTranches = tranches.filter(t => t.status === 'active')

  // Step 1: Calculate current period interest for each active tranche
  const trancheInterests = activeTranches.map(t => ({
    tranche: t,
    interest: t.currentBalance * t.interestRate * ((t.daysSinceInterestStart ?? daysSinceLastPayment) / 365)
  }))
  const totalCurrentInterest = trancheInterests.reduce((sum, ti) => sum + ti.interest, 0)

  // Step 2: remainder after covering current interest
  const remainder = paymentAmount - totalCurrentInterest

  let interestCovered: number
  let poolCovered = 0
  let bodyCovered = 0
  let overdueAddedToPool = 0
  let newOverduePool = overduePool

  if (remainder >= 0) {
    // Step 3a: Current interest fully covered
    interestCovered = totalCurrentInterest

    if (overduePool > 0) {
      const poolAllocation = Math.min(remainder * settings.poolRatio, overduePool)
      poolCovered = poolAllocation
      newOverduePool = overduePool - poolAllocation
      bodyCovered = remainder - poolAllocation
    } else {
      bodyCovered = remainder
      newOverduePool = 0
    }
  } else {
    // Step 3b: Payment didn't even cover current interest
    interestCovered = paymentAmount
    overdueAddedToPool = totalCurrentInterest - paymentAmount
    newOverduePool = overduePool + overdueAddedToPool
    bodyCovered = 0
  }

  // Distribute body reduction across tranches according to tranchePayoffOrder
  const trancheUpdates: TrancheUpdate[] = []
  let remainingBody = bodyCovered

  if (settings.tranchePayoffOrder === 'proportional') {
    // Distribute proportionally by current balance
    const totalActiveBalance = activeTranches.reduce((s, t) => s + t.currentBalance, 0)
    let distributed = 0
    activeTranches.forEach((t, i) => {
      const isLast = i === activeTranches.length - 1
      const share = isLast
        ? bodyCovered - distributed
        : totalActiveBalance > 0 ? bodyCovered * (t.currentBalance / totalActiveBalance) : 0
      distributed += share
      const newBal = Math.max(0, t.currentBalance - share)
      trancheUpdates.push({ id: t.id, newBalance: newBal, status: newBal <= 0 ? 'paid' : 'active' })
    })
    remainingBody = 0
  } else {
    let sortedTranches: Tranche[]
    if (settings.tranchePayoffOrder === 'smallest_balance') {
      sortedTranches = [...activeTranches].sort((a, b) => a.currentBalance - b.currentBalance)
    } else if (settings.tranchePayoffOrder === 'earliest_first') {
      sortedTranches = [...activeTranches].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    } else {
      // highest_rate (default)
      sortedTranches = [...activeTranches].sort((a, b) => b.interestRate - a.interestRate)
    }

    for (const t of sortedTranches) {
      if (remainingBody <= 0) {
        trancheUpdates.push({ id: t.id, newBalance: t.currentBalance, status: t.status })
        continue
      }
      if (remainingBody >= t.currentBalance) {
        remainingBody -= t.currentBalance
        trancheUpdates.push({ id: t.id, newBalance: 0, status: 'paid' })
      } else {
        trancheUpdates.push({ id: t.id, newBalance: t.currentBalance - remainingBody, status: 'active' })
        remainingBody = 0
      }
    }
  }

  // Add unchanged (already paid) tranches
  for (const t of tranches.filter(t => t.status === 'paid')) {
    if (!trancheUpdates.find(u => u.id === t.id)) {
      trancheUpdates.push({ id: t.id, newBalance: t.currentBalance, status: 'paid' })
    }
  }

  return {
    interestCovered,
    poolCovered,
    bodyCovered,
    overdueAddedToPool,
    newOverduePool,
    overpayment: Math.max(0, remainingBody),
    trancheUpdates
  }
}

export function calculateWeightedRate(tranches: Tranche[]): number {
  const active = tranches.filter(t => t.status === 'active')
  const totalBalance = active.reduce((sum, t) => sum + t.currentBalance, 0)
  if (totalBalance === 0) return 0
  const weightedSum = active.reduce((sum, t) => sum + t.currentBalance * t.interestRate, 0)
  return weightedSum / totalBalance
}

export function getForecastPayments(
  tranches: Tranche[],
  overduePool: number,
  monthlyPayment: number,
  maxMonths = 120,
  settings: DadDebtSettings = DEFAULT_SETTINGS
): Array<{
  month: number
  payment: number
  interestCovered: number
  poolCovered: number
  bodyCovered: number
  totalBalance: number
  overduePool: number
}> {
  let currentTranches = tranches.map(t => ({ ...t }))
  let currentPool = overduePool
  const result = []

  for (let m = 1; m <= maxMonths; m++) {
    const active = currentTranches.filter(t => t.status === 'active')
    if (active.length === 0 && currentPool === 0) break

    const res = calculateDadDebtPayment(currentTranches, currentPool, monthlyPayment, 30, settings)

    for (const upd of res.trancheUpdates) {
      const t = currentTranches.find(t => t.id === upd.id)
      if (t) {
        t.currentBalance = upd.newBalance
        t.status = upd.status
      }
    }
    currentPool = res.newOverduePool

    const totalBalance = currentTranches
      .filter(t => t.status === 'active')
      .reduce((sum, t) => sum + t.currentBalance, 0)

    result.push({
      month: m,
      payment: monthlyPayment,
      interestCovered: res.interestCovered,
      poolCovered: res.poolCovered,
      bodyCovered: res.bodyCovered,
      totalBalance,
      overduePool: currentPool
    })

    if (totalBalance === 0 && currentPool === 0) break
  }
  return result
}
