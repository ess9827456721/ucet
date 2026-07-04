import { describe, it, expect } from 'vitest'

/**
 * Recurrent cashflow formula (mirrors getCashFlow in database.ts):
 * cumLimit(1) = dailyBudget
 * cumLimit(n) = saldo(n-1) + dailyBudget   for n > 1
 * saldo(n)    = cumLimit(n) - dayExpenses(n)
 */
function simulateCashFlow(
  dailyBudget: number,
  expensesByDay: Map<number, number>,
  lastDay: number
): Array<{ day: number; cumLimit: number; saldo: number }> {
  let prevSaldo = 0
  const result = []
  for (let day = 1; day <= lastDay; day++) {
    const dayExpenses = expensesByDay.get(day) ?? 0
    const cumLimit = day === 1 ? dailyBudget : prevSaldo + dailyBudget
    const saldo = cumLimit - dayExpenses
    result.push({ day, cumLimit, saldo })
    prevSaldo = saldo
  }
  return result
}

describe('Рекуррентная формула накопленного лимита', () => {
  it('Без трат: cumLimit растёт линейно как dailyBudget × day', () => {
    const budget = 1000
    const rows = simulateCashFlow(budget, new Map(), 5)
    rows.forEach((r, i) => {
      expect(r.cumLimit).toBeCloseTo(budget * (i + 1), 5)
      expect(r.saldo).toBeCloseTo(budget * (i + 1), 5)
    })
  })

  it('Большой расход в день 2 уменьшает лимит на день 3', () => {
    const budget = 1000
    // День 2: потрачено 3000 (на 2000 больше лимита)
    const expenses = new Map([[2, 3000]])
    const rows = simulateCashFlow(budget, expenses, 5)

    expect(rows[0].cumLimit).toBeCloseTo(1000, 5) // день 1: 1000
    expect(rows[0].saldo).toBeCloseTo(1000, 5)

    expect(rows[1].cumLimit).toBeCloseTo(2000, 5) // день 2: saldo(1) + budget = 1000+1000
    expect(rows[1].saldo).toBeCloseTo(-1000, 5)   // 2000 - 3000 = -1000

    expect(rows[2].cumLimit).toBeCloseTo(0, 5)    // день 3: saldo(2) + budget = -1000+1000
    expect(rows[2].saldo).toBeCloseTo(0, 5)

    expect(rows[3].cumLimit).toBeCloseTo(1000, 5) // день 4: 0+1000
    expect(rows[3].saldo).toBeCloseTo(1000, 5)
  })

  it('Экономия в день 1 увеличивает накопленный лимит на день 2', () => {
    const budget = 1000
    // День 1: потрачено только 200 (сэкономили 800)
    const expenses = new Map([[1, 200]])
    const rows = simulateCashFlow(budget, expenses, 3)

    expect(rows[0].saldo).toBeCloseTo(800, 5)     // 1000 - 200
    expect(rows[1].cumLimit).toBeCloseTo(1800, 5) // 800 + 1000
    expect(rows[1].saldo).toBeCloseTo(1800, 5)    // трат нет
    expect(rows[2].cumLimit).toBeCloseTo(2800, 5) // 1800 + 1000
  })

  it('Дни без операций не прерывают цепочку (нулевые траты)', () => {
    const budget = 500
    // Только день 3 имеет траты
    const expenses = new Map([[3, 1000]])
    const rows = simulateCashFlow(budget, expenses, 4)

    expect(rows[0].cumLimit).toBeCloseTo(500, 5)
    expect(rows[1].cumLimit).toBeCloseTo(1000, 5)
    expect(rows[2].cumLimit).toBeCloseTo(1500, 5)
    expect(rows[2].saldo).toBeCloseTo(500, 5)     // 1500 - 1000
    expect(rows[3].cumLimit).toBeCloseTo(1000, 5) // 500 + 500
  })

  it('Реальные данные: dailyBudget ≈ −1724, день 20 даёт cumLimit ≈ −34 483 только без трат', () => {
    // Если трат нет совсем, линейная и рекуррентная совпадают
    const budget = -1724
    const rows = simulateCashFlow(budget, new Map(), 30)
    expect(rows[19].cumLimit).toBeCloseTo(-1724 * 20, 0) // день 20
  })
})
