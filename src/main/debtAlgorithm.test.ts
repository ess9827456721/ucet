import { describe, it, expect } from 'vitest'
import { calculateDadDebtPayment } from './debtAlgorithm'

const trancheA = { id: 1, currentBalance: 1_000_000, interestRate: 0.383, status: 'active' as const }
const trancheB = { id: 2, currentBalance: 500_000, interestRate: 0.359, status: 'active' as const }

describe('Алгоритм долга папе', () => {
  it('Пример 1: обычный платёж, пул пуст', () => {
    const result = calculateDadDebtPayment([trancheA, trancheB], 0, 80_000, 30)

    // Проценты A: 1_000_000 × 0.383 × (30/365) ≈ 31 479
    // Проценты B: 500_000 × 0.359 × (30/365) ≈ 14 753
    // Итого ≈ 46 233
    const expectedInterest = 46_232.88 // approximate
    expect(result.interestCovered).toBeCloseTo(expectedInterest, 0)

    // Остаток = 80_000 - 46_233 ≈ 33_767 → весь на тело (пул=0)
    const expectedBody = 80_000 - result.interestCovered
    expect(result.bodyCovered).toBeCloseTo(expectedBody, 1)
    expect(result.poolCovered).toBe(0)
    expect(result.overdueAddedToPool).toBe(0)
    expect(result.newOverduePool).toBe(0)

    // Тело списывается с транша A (высокая ставка 38.3%)
    const aUpd = result.trancheUpdates.find(u => u.id === 1)
    const bUpd = result.trancheUpdates.find(u => u.id === 2)
    expect(aUpd?.newBalance).toBeCloseTo(1_000_000 - expectedBody, 0)
    expect(aUpd?.status).toBe('active')
    expect(bUpd?.newBalance).toBe(500_000)
    expect(bUpd?.status).toBe('active')
  })

  it('Пример 2: платёж не покрывает проценты — пополнение пула', () => {
    const aAfter = { ...trancheA, currentBalance: 966_233 }
    const result = calculateDadDebtPayment([aAfter, trancheB], 0, 30_000, 30)

    // Текущие проценты: 966_233 × 0.383 × (30/365) + 500_000 × 0.359 × (30/365)
    const intA = 966_233 * 0.383 * (30 / 365)
    const intB = 500_000 * 0.359 * (30 / 365)
    const totalInt = intA + intB
    expect(result.interestCovered).toBeCloseTo(30_000, 0)
    expect(result.bodyCovered).toBe(0)
    expect(result.overdueAddedToPool).toBeCloseTo(totalInt - 30_000, 0)
    expect(result.newOverduePool).toBeCloseTo(totalInt - 30_000, 0)

    // Тело не меняется
    const aUpd = result.trancheUpdates.find(u => u.id === 1)
    expect(aUpd?.newBalance).toBe(966_233)
  })

  it('Пример 3: платёж с запасом при ненулевом пуле', () => {
    const aAfter = { id: 1, currentBalance: 966_233, interestRate: 0.383, status: 'active' as const }
    const pool = 15_170
    const result = calculateDadDebtPayment([aAfter, trancheB], pool, 100_000, 30)

    // Проценты ≈ 45_170
    const intA = 966_233 * 0.383 * (30 / 365)
    const intB = 500_000 * 0.359 * (30 / 365)
    const totalInt = intA + intB
    const remainder = 100_000 - totalInt

    // Пул: min(remainder * 0.5, pool) = min(27_415, 15_170) = 15_170
    expect(result.poolCovered).toBeCloseTo(pool, 0)
    // Тело = remainder - poolCovered
    expect(result.bodyCovered).toBeCloseTo(remainder - pool, 0)
    expect(result.newOverduePool).toBe(0)

    // Тело списывается с транша A (38.3% > 35.9%)
    const aUpd = result.trancheUpdates.find(u => u.id === 1)
    expect(aUpd!.newBalance).toBeCloseTo(966_233 - result.bodyCovered, 0)
  })

  it('Транш полностью погашается и переходит в статус paid', () => {
    const smallTranche = { id: 1, currentBalance: 10_000, interestRate: 0.5, status: 'active' as const }
    const result = calculateDadDebtPayment([smallTranche], 0, 100_000, 30)
    const upd = result.trancheUpdates.find(u => u.id === 1)
    expect(upd?.status).toBe('paid')
    expect(upd?.newBalance).toBe(0)
  })

  it('Распределение тела: самая высокая ставка гасится первой', () => {
    const t1 = { id: 1, currentBalance: 200_000, interestRate: 0.20, status: 'active' as const }
    const t2 = { id: 2, currentBalance: 200_000, interestRate: 0.40, status: 'active' as const }
    // Платёж покрывает все проценты + 300_000 тела
    const bigPayment = 200_000 * 0.20 * (30 / 365) + 200_000 * 0.40 * (30 / 365) + 300_000
    const result = calculateDadDebtPayment([t1, t2], 0, bigPayment, 30)
    // Транш t2 (40%) должен погаситься первым
    const u2 = result.trancheUpdates.find(u => u.id === 2)
    expect(u2?.status).toBe('paid')
    expect(u2?.newBalance).toBe(0)
    // t1 (20%) — частично погашен
    const u1 = result.trancheUpdates.find(u => u.id === 1)
    expect(u1?.status).toBe('active')
    expect(u1!.newBalance).toBeCloseTo(100_000, 0)
  })
})
