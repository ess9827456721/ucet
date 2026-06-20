import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { calculateDadDebtPayment, getForecastPayments } from './debtAlgorithm'

const DB_PATH = path.join(app.getPath('userData'), 'ucet.db')
let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema()
  }
  return db
}

function initSchema(): void {
  const d = getDb()
  d.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      color TEXT DEFAULT '#FFD600',
      icon TEXT DEFAULT 'circle',
      archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer','debt_op')),
      amount REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      subcategory_id INTEGER REFERENCES subcategories(id),
      expense_type TEXT CHECK(expense_type IN ('daily','big','apartment')),
      account_id INTEGER REFERENCES accounts(id),
      comment TEXT,
      debt_id INTEGER REFERENCES debts(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('i_owe','owe_me')),
      debt_type TEXT NOT NULL CHECK(debt_type IN ('dad','simple')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','closed')),
      initial_amount REAL,
      interest_rate REAL,
      payment_day INTEGER,
      monthly_payment REAL,
      overdue_interest_pool REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debt_tranches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id),
      date TEXT NOT NULL,
      initial_amount REAL NOT NULL,
      current_balance REAL NOT NULL,
      interest_rate REAL NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paid')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dad_debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id),
      payment_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      interest_covered REAL NOT NULL,
      pool_covered REAL NOT NULL,
      body_covered REAL NOT NULL,
      overdue_added_to_pool REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dad_debt_tranche_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES dad_debt_payments(id),
      tranche_id INTEGER NOT NULL REFERENCES debt_tranches(id),
      amount_applied REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simple_debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id),
      payment_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      interest_part REAL DEFAULT 0,
      body_part REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    );
  `)
  seedDefaultData(d)
}

function seedDefaultData(d: Database.Database): void {
  const count = (d.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c
  if (count > 0) return

  const categoryColors: Record<string, string> = {
    'Транспорт': '#3B82F6', 'Еда': '#F97316', 'Рестораны': '#EC4899',
    'Алкоголь': '#8B5CF6', 'Подарки': '#EF4444', 'Продукты': '#22C55E',
    'Сигареты': '#6B7280', 'Работа': '#0EA5E9', 'Автомобиль': '#F59E0B',
    'Здоровье': '#10B981', 'Одежда': '#F472B6', 'Обучение': '#A855F7',
    'Культ. мероприятия': '#14B8A6', 'Связь': '#64748B', 'Прочее': '#94A3B8',
    'Аренда': '#DC2626', 'ЖКХ': '#B45309', 'Все для дома': '#D97706'
  }

  const expenseCategories: Array<{ name: string; subs: string[] }> = [
    { name: 'Транспорт', subs: ['Такси', 'Автобус', 'Метро', 'Электричка', 'Другой транспорт', 'Самокат', 'Каршеринг'] },
    { name: 'Еда', subs: ['Обед (работа)', 'Перекус', 'Фаст-Фуд', 'Сладости', 'Доставка'] },
    { name: 'Рестораны', subs: ['Бар', 'Ресторан', 'Доставка', 'Кальянная', 'Кофе'] },
    { name: 'Алкоголь', subs: ['Пиво', 'Крепкое', 'Закуски'] },
    { name: 'Подарки', subs: ['Родственники', 'Друзья', 'Работа', 'Девушка'] },
    { name: 'Продукты', subs: [] },
    { name: 'Сигареты', subs: [] },
    { name: 'Работа', subs: ['Канцелярия', 'Проживание', 'Почтовые услуги', 'Сервисы', 'Транспорт', 'Налог'] },
    { name: 'Автомобиль', subs: ['Бензин', 'Парковка', 'Мойка', 'Ремонт'] },
    { name: 'Здоровье', subs: ['Витамины', 'Лекарства', 'Личная гигиена', 'Врачи', 'Красота', 'Спорт'] },
    { name: 'Одежда', subs: [] },
    { name: 'Обучение', subs: ['Книги', 'Курсы'] },
    { name: 'Культ. мероприятия', subs: ['Кино', 'Театры', 'Музеи', 'Спортивные события'] },
    { name: 'Связь', subs: ['Телефон', 'Интернет'] },
    { name: 'Прочее', subs: ['Подписка на сервисы', 'Быт. химия'] },
    { name: 'Аренда', subs: [] },
    { name: 'ЖКХ', subs: ['Основное жильё', 'Другая квартира'] },
    { name: 'Все для дома', subs: [] },
  ]

  const insertCat = d.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)')
  const insertSub = d.prepare('INSERT INTO subcategories (category_id, name) VALUES (?, ?)')

  for (const cat of expenseCategories) {
    const res = insertCat.run(cat.name, 'expense', categoryColors[cat.name] || '#94A3B8')
    for (const sub of cat.subs) {
      insertSub.run(res.lastInsertRowid, sub)
    }
  }

  const incomeCategories = ['Зарплата', 'Подработка', 'Аренда (доход)', 'Целевые поступления', 'Возврат долга', 'Прочее']
  for (const name of incomeCategories) {
    insertCat.run(name, 'income', '#22C55E')
  }

  d.prepare('INSERT INTO accounts (name, balance) VALUES (?, ?)').run('Основной счёт', 0)
}

// ──────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────

export function getOperations(filters: {
  dateFrom?: string
  dateTo?: string
  type?: string
  categoryId?: number
  subcategoryId?: number
  commentSearch?: string
  amountFrom?: number
  amountTo?: number
  limit?: number
  offset?: number
}): unknown[] {
  const d = getDb()
  const parts: string[] = ['1=1']
  const params: unknown[] = []
  if (filters.dateFrom) { parts.push('o.date >= ?'); params.push(filters.dateFrom) }
  if (filters.dateTo) { parts.push('o.date <= ?'); params.push(filters.dateTo) }
  if (filters.type) { parts.push('o.type = ?'); params.push(filters.type) }
  if (filters.categoryId) { parts.push('o.category_id = ?'); params.push(filters.categoryId) }
  if (filters.subcategoryId) { parts.push('o.subcategory_id = ?'); params.push(filters.subcategoryId) }
  if (filters.commentSearch) { parts.push('o.comment LIKE ?'); params.push(`%${filters.commentSearch}%`) }
  if (filters.amountFrom != null) { parts.push('o.amount >= ?'); params.push(filters.amountFrom) }
  if (filters.amountTo != null) { parts.push('o.amount <= ?'); params.push(filters.amountTo) }

  const sql = `
    SELECT o.*, c.name as category_name, c.color as category_color,
           s.name as subcategory_name
    FROM operations o
    LEFT JOIN categories c ON o.category_id = c.id
    LEFT JOIN subcategories s ON o.subcategory_id = s.id
    WHERE ${parts.join(' AND ')}
    ORDER BY o.date DESC, o.created_at DESC
    ${filters.limit ? `LIMIT ${filters.limit} OFFSET ${filters.offset || 0}` : ''}
  `
  return d.prepare(sql).all(...params)
}

export function addOperation(op: {
  date: string
  type: string
  amount: number
  category_id?: number | null
  subcategory_id?: number | null
  expense_type?: string | null
  account_id?: number | null
  comment?: string | null
  debt_id?: number | null
}): number {
  const d = getDb()
  const r = d.prepare(`
    INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
    VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, @account_id, @comment, @debt_id)
  `).run({
    ...op,
    category_id: op.category_id ?? null,
    subcategory_id: op.subcategory_id ?? null,
    expense_type: op.expense_type ?? null,
    account_id: op.account_id ?? null,
    comment: op.comment ?? null,
    debt_id: op.debt_id ?? null,
  })
  return r.lastInsertRowid as number
}

export function importOperations(ops: Array<{
  date: string
  type: string
  amount: number
  category_id?: number | null
  subcategory_id?: number | null
  expense_type?: string | null
  comment?: string | null
}>): number {
  const d = getDb()
  const stmt = d.prepare(`
    INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
    VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, NULL, @comment, NULL)
  `)
  const insertMany = d.transaction((rows: typeof ops) => {
    for (const op of rows) {
      stmt.run({
        ...op,
        category_id: op.category_id ?? null,
        subcategory_id: op.subcategory_id ?? null,
        expense_type: op.expense_type ?? null,
        comment: op.comment ?? null,
      })
    }
    return rows.length
  })
  return insertMany(ops) as number
}

export function updateOperation(id: number, op: {
  date?: string
  type?: string
  amount?: number
  category_id?: number
  subcategory_id?: number
  expense_type?: string
  comment?: string
}): void {
  const d = getDb()
  const fields = Object.entries(op)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  d.prepare(`UPDATE operations SET ${fields} WHERE id = @id`).run({ ...op, id })
}

export function deleteOperation(id: number): void {
  getDb().prepare('DELETE FROM operations WHERE id = ?').run(id)
}

// ──────────────────────────────────────────────────────────────
// Categories
// ──────────────────────────────────────────────────────────────

export function getCategories(type?: string): unknown[] {
  const d = getDb()
  if (type) return d.prepare("SELECT * FROM categories WHERE type = ? AND archived = 0 ORDER BY name").all(type)
  return d.prepare("SELECT * FROM categories WHERE archived = 0 ORDER BY name").all()
}

export function getSubcategories(categoryId?: number): unknown[] {
  const d = getDb()
  if (categoryId) return d.prepare("SELECT * FROM subcategories WHERE category_id = ? AND archived = 0").all(categoryId)
  return d.prepare("SELECT * FROM subcategories WHERE archived = 0").all()
}

export function addCategory(cat: { name: string; type: string; color?: string; icon?: string }): number {
  const r = getDb().prepare('INSERT INTO categories (name, type, color, icon) VALUES (@name, @type, @color, @icon)').run(cat)
  return r.lastInsertRowid as number
}

export function updateCategory(id: number, data: { name?: string; color?: string; icon?: string; archived?: number }): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE categories SET ${fields} WHERE id = @id`).run({ ...data, id })
}

export function addSubcategory(sub: { category_id: number; name: string }): number {
  const r = getDb().prepare('INSERT INTO subcategories (category_id, name) VALUES (@category_id, @name)').run(sub)
  return r.lastInsertRowid as number
}

export function updateSubcategory(id: number, data: { name?: string; archived?: number }): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE subcategories SET ${fields} WHERE id = @id`).run({ ...data, id })
}

// ──────────────────────────────────────────────────────────────
// Debts
// ──────────────────────────────────────────────────────────────

export function getDebts(status?: string): unknown[] {
  const d = getDb()
  if (status) return d.prepare('SELECT * FROM debts WHERE status = ? ORDER BY created_at DESC').all(status)
  return d.prepare('SELECT * FROM debts ORDER BY created_at DESC').all()
}

export function getDebt(id: number): unknown {
  return getDb().prepare('SELECT * FROM debts WHERE id = ?').get(id)
}

export function addDebt(debt: {
  name: string
  direction: string
  debt_type: string
  initial_amount?: number | null
  interest_rate?: number | null
  payment_day?: number | null
  monthly_payment?: number | null
}): number {
  const r = getDb().prepare(`
    INSERT INTO debts (name, direction, debt_type, initial_amount, interest_rate, payment_day, monthly_payment)
    VALUES (@name, @direction, @debt_type, @initial_amount, @interest_rate, @payment_day, @monthly_payment)
  `).run({
    ...debt,
    initial_amount: debt.initial_amount ?? null,
    interest_rate: debt.interest_rate ?? null,
    payment_day: debt.payment_day ?? null,
    monthly_payment: debt.monthly_payment ?? null,
  })
  return r.lastInsertRowid as number
}

export function getDebtsWithBalance(): unknown[] {
  const d = getDb()
  const debts = d.prepare('SELECT * FROM debts ORDER BY created_at DESC').all() as Array<{
    id: number; debt_type: string; initial_amount: number | null; [key: string]: unknown
  }>
  return debts.map(debt => {
    let currentBalance: number
    if (debt.debt_type === 'dad') {
      const row = d.prepare(
        "SELECT COALESCE(SUM(current_balance),0) as bal FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).get(debt.id) as { bal: number }
      currentBalance = row.bal
    } else {
      const row = d.prepare(
        'SELECT COALESCE(SUM(body_part),0) as paid FROM simple_debt_payments WHERE debt_id = ?'
      ).get(debt.id) as { paid: number }
      currentBalance = Math.max(0, (debt.initial_amount || 0) - row.paid)
    }
    return { ...debt, current_balance: currentBalance }
  })
}

export function updateDebt(id: number, data: {
  name?: string
  status?: string
  direction?: string
  initial_amount?: number | null
  interest_rate?: number | null
  payment_day?: number | null
  monthly_payment?: number | null
  overdue_interest_pool?: number
}): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  if (!fields) return
  getDb().prepare(`UPDATE debts SET ${fields} WHERE id = @id`).run({ ...data, id })
}

export function deleteDebt(id: number): void {
  const d = getDb()
  d.transaction(() => {
    const paymentIds = d.prepare('SELECT id FROM dad_debt_payments WHERE debt_id = ?').all(id) as Array<{ id: number }>
    for (const p of paymentIds) {
      d.prepare('DELETE FROM dad_debt_tranche_payments WHERE payment_id = ?').run(p.id)
    }
    d.prepare('DELETE FROM dad_debt_payments WHERE debt_id = ?').run(id)
    d.prepare('DELETE FROM debt_tranches WHERE debt_id = ?').run(id)
    d.prepare('DELETE FROM simple_debt_payments WHERE debt_id = ?').run(id)
    d.prepare('DELETE FROM operations WHERE debt_id = ?').run(id)
    d.prepare('DELETE FROM debts WHERE id = ?').run(id)
  })()
}

export function getTranches(debtId: number): unknown[] {
  return getDb().prepare('SELECT * FROM debt_tranches WHERE debt_id = ? ORDER BY date ASC').all(debtId)
}

export function addTranche(tranche: {
  debt_id: number
  date: string
  initial_amount: number
  interest_rate: number
}): number {
  const r = getDb().prepare(`
    INSERT INTO debt_tranches (debt_id, date, initial_amount, current_balance, interest_rate)
    VALUES (@debt_id, @date, @initial_amount, @initial_amount, @interest_rate)
  `).run(tranche)
  return r.lastInsertRowid as number
}

export function processDadPayment(debtId: number, paymentAmount: number, paymentDate: string, daysSince: number): unknown {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { overdue_interest_pool: number; name: string }
  const tranchesRaw = d.prepare('SELECT * FROM debt_tranches WHERE debt_id = ?').all(debtId) as Array<{
    id: number; current_balance: number; interest_rate: number; status: string
  }>

  const tranches = tranchesRaw.map(t => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status as 'active' | 'paid'
  }))

  const result = calculateDadDebtPayment(tranches, debt.overdue_interest_pool, paymentAmount, daysSince)

  const processPayment = d.transaction(() => {
    const paymentId = d.prepare(`
      INSERT INTO dad_debt_payments (debt_id, payment_date, total_amount, interest_covered, pool_covered, body_covered, overdue_added_to_pool)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(debtId, paymentDate, paymentAmount, result.interestCovered, result.poolCovered, result.bodyCovered, result.overdueAddedToPool).lastInsertRowid

    for (const upd of result.trancheUpdates) {
      const prev = tranches.find(t => t.id === upd.id)
      const applied = prev ? prev.currentBalance - upd.newBalance : 0
      if (applied > 0) {
        d.prepare('INSERT INTO dad_debt_tranche_payments (payment_id, tranche_id, amount_applied) VALUES (?, ?, ?)').run(paymentId, upd.id, applied)
      }
      d.prepare('UPDATE debt_tranches SET current_balance = ?, status = ? WHERE id = ?').run(upd.newBalance, upd.status, upd.id)
    }

    d.prepare('UPDATE debts SET overdue_interest_pool = ? WHERE id = ?').run(result.newOverduePool, debtId)

    d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, paymentAmount, `Платёж по долгу: ${debt.name}`, debtId)

    return paymentId
  })

  processPayment()
  return result
}

export function getDadPaymentHistory(debtId: number): unknown[] {
  const d = getDb()
  const payments = d.prepare('SELECT * FROM dad_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC').all(debtId) as Array<{ id: number }>
  return payments.map(p => {
    const trancheBreakdown = d.prepare(`
      SELECT dtp.*, dt.interest_rate, dt.date as tranche_date
      FROM dad_debt_tranche_payments dtp
      JOIN debt_tranches dt ON dtp.tranche_id = dt.id
      WHERE dtp.payment_id = ?
    `).all(p.id)
    return { ...p, trancheBreakdown }
  })
}

export function getSimpleDebtPayments(debtId: number): unknown[] {
  return getDb().prepare('SELECT * FROM simple_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC').all(debtId)
}

export function processSimplePayment(debtId: number, amount: number, paymentDate: string, interestPart = 0): void {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { initial_amount: number; name: string }
  d.transaction(() => {
    const bodyPart = amount - interestPart
    d.prepare('INSERT INTO simple_debt_payments (debt_id, payment_date, total_amount, interest_part, body_part) VALUES (?, ?, ?, ?, ?)').run(debtId, paymentDate, amount, interestPart, bodyPart)
    const paid = (d.prepare('SELECT SUM(body_part) as total FROM simple_debt_payments WHERE debt_id = ?').get(debtId) as { total: number }).total || 0
    if (paid >= debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(debtId)
    }
    d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, amount, `Платёж по долгу: ${debt.name}`, debtId)
  })()
}

export function getDadForecast(debtId: number, monthlyPayment: number): unknown[] {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { overdue_interest_pool: number }
  const tranchesRaw = d.prepare('SELECT * FROM debt_tranches WHERE debt_id = ?').all(debtId) as Array<{
    id: number; current_balance: number; interest_rate: number; status: string
  }>
  const tranches = tranchesRaw.map(t => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status as 'active' | 'paid'
  }))
  return getForecastPayments(tranches, debt.overdue_interest_pool, monthlyPayment)
}

export function getSimpleForecast(debtId: number, monthlyPayment: number): unknown[] {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as {
    initial_amount: number; interest_rate: number | null
  }

  const paid = (d.prepare('SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?').get(debtId) as { total: number }).total

  let balance = Math.max(0, (debt.initial_amount || 0) - paid)
  const rate = debt.interest_rate || 0
  const result = []

  for (let m = 1; m <= 360 && balance > 0; m++) {
    const interest = balance * rate * (30 / 365)
    const bodyPayment = Math.min(balance, Math.max(0, monthlyPayment - interest))
    const actualInterest = Math.min(interest, monthlyPayment)
    balance -= bodyPayment
    result.push({
      month: m,
      payment: monthlyPayment,
      interestCovered: actualInterest,
      poolCovered: 0,
      bodyCovered: bodyPayment,
      totalBalance: Math.max(0, balance),
      overduePool: 0,
    })
    if (balance <= 0) break
  }
  return result
}

// ──────────────────────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────────────────────

export function getSummary(dateFrom: string, dateTo: string, expenseType?: string): unknown {
  const d = getDb()
  const income = (d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo) as { total: number }).total
  const etClause = expenseType ? ` AND expense_type = '${expenseType}'` : ''
  const expense = (d.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense'${etClause} AND date >= ? AND date <= ?`).get(dateFrom, dateTo) as { total: number }).total
  const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)
  return { income, expense, balance: income - expense, avgPerDay: expense / days }
}

export function getExpensesByCategory(dateFrom: string, dateTo: string, expenseType?: string): unknown[] {
  const etClause = expenseType ? ` AND o.expense_type = '${expenseType}'` : ''
  return getDb().prepare(`
    SELECT c.id, c.name, c.color, SUM(o.amount) as total
    FROM operations o
    JOIN categories c ON o.category_id = c.id
    WHERE o.type = 'expense'${etClause} AND o.date >= ? AND o.date <= ?
    GROUP BY c.id ORDER BY total DESC
  `).all(dateFrom, dateTo)
}

export function getDailyExpenses(dateFrom: string, dateTo: string, expenseType?: string): unknown[] {
  const etFilter = expenseType ? ` AND expense_type = '${expenseType}'` : ''
  return getDb().prepare(`
    SELECT date,
      SUM(CASE WHEN type='expense'${etFilter} THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income
    FROM operations WHERE date >= ? AND date <= ?
    GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo)
}

export function getExpensesByType(dateFrom: string, dateTo: string): unknown[] {
  return getDb().prepare(`
    SELECT expense_type, SUM(amount) as total
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY expense_type
  `).all(dateFrom, dateTo)
}

export function getMonthlyExpenses(dateFrom: string, dateTo: string): unknown[] {
  return getDb().prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN expense_type='daily' THEN amount ELSE 0 END) as daily,
           SUM(CASE WHEN expense_type='big' THEN amount ELSE 0 END) as big,
           SUM(CASE WHEN expense_type='apartment' THEN amount ELSE 0 END) as apartment
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY month ORDER BY month ASC
  `).all(dateFrom, dateTo)
}

export function getExpensesByDayOfWeek(dateFrom: string, dateTo: string): unknown[] {
  return getDb().prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) as dow, SUM(amount) as total, COUNT(*) as count
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY dow ORDER BY dow ASC
  `).all(dateFrom, dateTo)
}

// ──────────────────────────────────────────────────────────────
// Budget
// ──────────────────────────────────────────────────────────────

export function getBudgetSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM budget_settings').all() as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export function setBudgetSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO budget_settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getCashFlow(year: number, month: number): unknown {
  const d = getDb()
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const income = (d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo) as { total: number }).total
  const mandatory = (d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense' AND expense_type='apartment' AND date >= ? AND date <= ?").get(dateFrom, dateTo) as { total: number }).total
  const dailyBudget = (income - mandatory) / lastDay

  const dailyRows = d.prepare(`
    SELECT date, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as day_expenses
    FROM operations WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo) as Array<{ date: string; day_expenses: number }>

  let cumExpenses = 0
  let cumLimit = 0
  const journal = dailyRows.map(row => {
    cumExpenses += row.day_expenses
    const dayNum = parseInt(row.date.split('-')[2])
    cumLimit = dailyBudget * dayNum
    return {
      date: row.date,
      dayExpenses: row.day_expenses,
      cumLimit: Math.round(cumLimit * 100) / 100,
      saldo: Math.round((cumLimit - cumExpenses) * 100) / 100
    }
  })

  return { income, mandatory, dailyBudget, journal, dateFrom, dateTo }
}

// ──────────────────────────────────────────────────────────────
// Backup / Export
// ──────────────────────────────────────────────────────────────

export function exportDb(targetPath: string): void {
  const d = getDb()
  d.backup(targetPath)
}

export function importDb(sourcePath: string): void {
  if (db) { db.close(); db = null as unknown as Database.Database }
  fs.copyFileSync(sourcePath, DB_PATH)
  getDb()
}

export function getDbPath(): string {
  return DB_PATH
}
