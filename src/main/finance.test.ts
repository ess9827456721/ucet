import { describe, it, expect } from 'vitest'
import {
  fmtDateLocal,
  paymentPeriod,
  isOverdue,
  trancheAccruedInterest,
  splitSimplePayment,
  dailySavingsInterest,
} from './finance'

// ТЗ #18, Этап 1 — тесты на исправленные финансовые баги

describe('Б3: fmtDateLocal — границы периода без сдвига часового пояса', () => {
  it('локальная полночь форматируется как тот же календарный день', () => {
    // toISOString() от этой даты в UTC+N дал бы предыдущий день
    const d = new Date(2026, 6, 20) // 20 июля 2026, локальная полночь
    expect(fmtDateLocal(d)).toBe('2026-07-20')
  })

  it('платёж, внесённый ровно в день платежа, попадает в период', () => {
    const today = new Date(2026, 6, 21) // 21 июля
    const { startStr, endStr } = paymentPeriod(today, 20)
    expect(startStr).toBe('2026-06-20')
    expect(endStr).toBe('2026-07-20')
    // Платёж 20 июля: startStr <= '2026-07-20' <= endStr
    expect('2026-07-20' >= startStr && '2026-07-20' <= endStr).toBe(true)
    // Платёж за день до начала периода НЕ попадает
    expect('2026-06-19' >= startStr).toBe(false)
  })

  it('переход через январь: период декабрь-январь', () => {
    const today = new Date(2026, 0, 25) // 25 января
    const { startStr, endStr } = paymentPeriod(today, 20)
    expect(startStr).toBe('2025-12-20')
    expect(endStr).toBe('2026-01-20')
  })
})

describe('Б1+Б11: isOverdue — просрочка только после дня платежа и только без оплаты', () => {
  it('до дня платежа просрочки нет, даже если период не оплачен', () => {
    expect(isOverdue('2026-07-25', '2026-07-30', false)).toBe(false)
  })

  it('в сам день платежа просрочки ещё нет (Б11)', () => {
    expect(isOverdue('2026-07-30', '2026-07-30', false)).toBe(false)
  })

  it('на следующий день после дня платежа без оплаты — просрочка', () => {
    expect(isOverdue('2026-07-31', '2026-07-30', false)).toBe(true)
  })

  it('после дня платежа с оплатой — просрочки нет', () => {
    expect(isOverdue('2026-07-31', '2026-07-30', true)).toBe(false)
  })
})

describe('Б4: trancheAccruedInterest — транш новее последнего платежа', () => {
  it('транш от 15-го при последнем платеже 1-го получает проценты только с 15-го', () => {
    const today = new Date(2026, 6, 25) // 25 июля
    const tranches = [
      { current_balance: 100000, interest_rate: 0.365, date: '2026-07-15' },
    ]
    // Последний платёж 1 июля; транш выдан 15-го → проценты за 10 дней (15→25), не за 24
    const interest = trancheAccruedInterest(tranches, '2026-07-01', today)
    const expected = 100000 * 0.365 * (10 / 365) // = 1000
    expect(interest).toBeCloseTo(expected, 2)
  })

  it('старый транш считается от даты последнего платежа', () => {
    const today = new Date(2026, 6, 25)
    const tranches = [
      { current_balance: 100000, interest_rate: 0.365, date: '2026-05-01' },
    ]
    const interest = trancheAccruedInterest(tranches, '2026-07-01', today)
    const expected = 100000 * 0.365 * (24 / 365)
    expect(interest).toBeCloseTo(expected, 2)
  })

  it('без платежей проценты идут от даты каждого транша', () => {
    const today = new Date(2026, 6, 25)
    const tranches = [
      { current_balance: 50000, interest_rate: 0.365, date: '2026-07-05' },
      { current_balance: 50000, interest_rate: 0.365, date: '2026-07-15' },
    ]
    const interest = trancheAccruedInterest(tranches, null, today)
    const expected = 50000 * 0.365 * (20 / 365) + 50000 * 0.365 * (10 / 365)
    expect(interest).toBeCloseTo(expected, 2)
  })
})

describe('Б5: splitSimplePayment — переплата не исчезает молча', () => {
  it('обычный платёж: тело = сумма − проценты, переплаты нет', () => {
    const r = splitSimplePayment(10000, 1000, 108000)
    expect(r.bodyPart).toBe(9000)
    expect(r.overpayment).toBe(0)
  })

  it('кейс Яндекса: остаток 108 000, платёж 120 000 → переплата 12 000', () => {
    const r = splitSimplePayment(120000, 0, 108000)
    expect(r.bodyPart).toBe(108000)
    expect(r.overpayment).toBe(12000)
  })

  it('переплата с учётом процентов', () => {
    const r = splitSimplePayment(120000, 5000, 108000)
    expect(r.bodyPart).toBe(108000)
    expect(r.overpayment).toBe(7000)
  })
})

describe('Б6: dailySavingsInterest — проценты по дневным остаткам', () => {
  it('пополнение 100 000 за 3 дня до начисления даёт проценты за 3 дня, а не за 30', () => {
    // Счёт открыт 01.06 с балансом 0, ставка 20%, пополнение 100 000 27.06, начисление 30.06
    const asOf = new Date(2026, 5, 30) // 30 июня
    const interest = dailySavingsInterest(
      100000, // текущий баланс
      0.2,
      'capitalize',
      '2026-06-01',
      asOf,
      [{ type: 'deposit', amount: 100000, date: '2026-06-27' }]
    )
    const expected = 100000 * 0.2 * (3 / 365) // ≈ 164.38
    expect(interest).toBeCloseTo(expected, 2)
    expect(interest).not.toBeCloseTo(100000 * 0.2 * (29 / 365), 0)
  })

  it('постоянный баланс — совпадает со старой формулой balance × rate × days/365', () => {
    const asOf = new Date(2026, 5, 30)
    const interest = dailySavingsInterest(100000, 0.2, 'capitalize', '2026-05-31', asOf, [])
    expect(interest).toBeCloseTo(100000 * 0.2 * (30 / 365), 2)
  })

  it('снятие в середине периода уменьшает базу с дня снятия', () => {
    const asOf = new Date(2026, 5, 21) // период 01.06→21.06, 20 дней
    // Баланс был 100 000, 11.06 сняли 50 000 → текущий 50 000
    const interest = dailySavingsInterest(
      50000, 0.2, 'capitalize', '2026-06-01', asOf,
      [{ type: 'withdrawal', amount: 50000, date: '2026-06-11' }]
    )
    // 10 дней (02..11) по 100 000 + 10 дней (12..21) по 50 000
    const expected = 100000 * 0.2 * (10 / 365) + 50000 * 0.2 * (10 / 365)
    expect(interest).toBeCloseTo(expected, 2)
  })

  it('нулевая ставка — ноль процентов', () => {
    expect(dailySavingsInterest(100000, 0, 'capitalize', '2026-06-01', new Date(2026, 5, 30), [])).toBe(0)
  })
})
