// Чистые финансовые функции, выделенные из database.ts для тестируемости (ТЗ #18, Этап 1).

/**
 * Форматирование даты в YYYY-MM-DD по ЛОКАЛЬНОМУ времени.
 * Б3: toISOString() от локальной полуночи в UTC+N даёт предыдущий день —
 * границы платёжного периода сдвигались на сутки.
 */
export function fmtDateLocal(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * Границы текущего платёжного периода для долга с днём платежа payDay:
 * [payment_day прошлого месяца .. payment_day текущего месяца].
 */
export function paymentPeriod(today: Date, payDay: number): { startStr: string; endStr: string; todayStr: string } {
  const end = new Date(today.getFullYear(), today.getMonth(), payDay)
  const start = new Date(today.getFullYear(), today.getMonth() - 1, payDay)
  return { startStr: fmtDateLocal(start), endStr: fmtDateLocal(end), todayStr: fmtDateLocal(today) }
}

/**
 * Б11: просрочка наступает только на СЛЕДУЮЩИЙ календарный день после дня платежа
 * (сравнение строк YYYY-MM-DD эквивалентно сравнению календарных дат).
 * Б1: просрочка = дата прошла И обязательный платёж периода не внесён.
 */
export function isOverdue(todayStr: string, periodEndStr: string, periodPaid: boolean): boolean {
  return todayStr > periodEndStr && !periodPaid
}

/**
 * Б4: накопленный процент по траншам — у каждого транша проценты идут
 * от max(даты транша, даты последнего платежа), а не от последнего платежа для всех.
 */
export function trancheAccruedInterest(
  tranches: Array<{ current_balance: number; interest_rate: number; date: string }>,
  lastPaymentDate: string | null,
  today: Date
): number {
  return tranches.reduce((s, t) => {
    const startStr = lastPaymentDate && lastPaymentDate > t.date ? lastPaymentDate : t.date
    const start = new Date(startStr + 'T00:00:00')
    const days = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000))
    return s + t.current_balance * t.interest_rate * (days / 365)
  }, 0)
}

/**
 * Б5: тело платежа по simple-долгу не может превышать остаток долга;
 * излишек возвращается как overpayment для предупреждения пользователя.
 */
export function splitSimplePayment(
  amount: number,
  interestPart: number,
  remainingBody: number
): { bodyPart: number; overpayment: number } {
  const rawBody = amount - interestPart
  if (rawBody <= remainingBody) return { bodyPart: rawBody, overpayment: 0 }
  return { bodyPart: remainingBody, overpayment: rawBody - remainingBody }
}

export interface SavingsTxLike {
  type: string
  amount: number
  date: string
}

/**
 * Б6: проценты по накопительному счёту по фактическим ДНЕВНЫМ остаткам
 * (модель реального банка), а не по текущему балансу за весь период.
 *
 * currentBalance — текущий баланс счёта; txsAfterSince — транзакции с date > sinceStr.
 * Стартовый остаток на дату sinceStr реконструируется вычитанием более поздних транзакций.
 * За каждый день (sinceStr, asOf] начисляется остаток_на_начало_дня × rate / 365.
 */
export function dailySavingsInterest(
  currentBalance: number,
  rate: number,
  interestMode: string,
  sinceStr: string,
  asOf: Date,
  txsAfterSince: SavingsTxLike[]
): number {
  if (rate <= 0) return 0
  const sinceDate = new Date(sinceStr + 'T00:00:00')
  const totalDays = Math.max(0, Math.round((asOf.getTime() - sinceDate.getTime()) / 86400000))
  if (totalDays === 0) return 0

  const txDelta = (t: SavingsTxLike): number => {
    if (t.type === 'deposit') return t.amount
    if (t.type === 'withdrawal') return -t.amount
    if (t.type === 'interest' && interestMode === 'capitalize') return t.amount
    return 0
  }

  const txs = [...txsAfterSince].sort((a, b) => a.date.localeCompare(b.date))
  let balance = currentBalance - txs.reduce((s, t) => s + txDelta(t), 0)

  let interest = 0
  let ti = 0
  const cursor = new Date(sinceDate)
  for (let i = 1; i <= totalDays; i++) {
    cursor.setDate(cursor.getDate() + 1)
    const dayStr = fmtDateLocal(cursor)
    // Пополнение в день D начинает приносить проценты со дня D+1
    while (ti < txs.length && txs[ti].date < dayStr) {
      balance += txDelta(txs[ti])
      ti++
    }
    interest += balance * (rate / 365)
  }
  return interest
}
