import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { calculateDadDebtPayment, getForecastPayments, DadDebtSettings } from './debtAlgorithm'
import { fmtDateLocal, paymentPeriod, isOverdue as computeIsOverdue, trancheAccruedInterest, splitSimplePayment, dailySavingsInterest, SavingsTxLike } from './finance'

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

    CREATE TABLE IF NOT EXISTS recurring_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      amount REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      subcategory_id INTEGER REFERENCES subcategories(id),
      expense_type TEXT CHECK(expense_type IN ('daily','big','apartment')),
      day_of_month INTEGER NOT NULL,
      comment TEXT,
      active INTEGER DEFAULT 1,
      last_created TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      color TEXT DEFAULT '#22C55E',
      target_date TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','completed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mandatory_expense_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      category TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      actual_amount REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      interest_mode TEXT NOT NULL DEFAULT 'capitalize',
      payout_period TEXT NOT NULL DEFAULT 'monthly',
      goal_name TEXT,
      goal_amount REAL,
      goal_date TEXT,
      auto_contribute_pct REAL,
      notify_contribution INTEGER DEFAULT 0,
      notify_day INTEGER,
      color TEXT DEFAULT '#22C55E',
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      opened_at TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES savings_accounts(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      comment TEXT,
      linked_operation_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  seedDefaultData(d)

  // Schema migrations
  const dadCols = (d.prepare('PRAGMA table_info(dad_debt_payments)').all() as Array<{ name: string }>).map(c => c.name)
  if (!dadCols.includes('operation_id')) {
    d.exec('ALTER TABLE dad_debt_payments ADD COLUMN operation_id INTEGER')
  }
  if (!dadCols.includes('marked_sufficient')) {
    d.exec('ALTER TABLE dad_debt_payments ADD COLUMN marked_sufficient INTEGER DEFAULT 0')
  }
  const simpleCols = (d.prepare('PRAGMA table_info(simple_debt_payments)').all() as Array<{ name: string }>).map(c => c.name)
  if (!simpleCols.includes('operation_id')) {
    d.exec('ALTER TABLE simple_debt_payments ADD COLUMN operation_id INTEGER')
  }
  if (!simpleCols.includes('payment_type')) {
    d.exec("ALTER TABLE simple_debt_payments ADD COLUMN payment_type TEXT DEFAULT 'mandatory'")
  }
  const debtCols = (d.prepare('PRAGMA table_info(debts)').all() as Array<{ name: string }>).map(c => c.name)
  if (!debtCols.includes('category')) d.exec('ALTER TABLE debts ADD COLUMN category TEXT')
  if (!debtCols.includes('sort_order')) d.exec('ALTER TABLE debts ADD COLUMN sort_order INTEGER DEFAULT 0')
  if (!debtCols.includes('is_hidden')) d.exec('ALTER TABLE debts ADD COLUMN is_hidden INTEGER DEFAULT 0')
  const opCols = (d.prepare('PRAGMA table_info(operations)').all() as Array<{ name: string }>).map(c => c.name)
  if (!opCols.includes('goal_id')) d.exec('ALTER TABLE operations ADD COLUMN goal_id INTEGER REFERENCES savings_goals(id)')
  if (!debtCols.includes('loan_date')) d.exec('ALTER TABLE debts ADD COLUMN loan_date TEXT')
  if (!debtCols.includes('tranche_payoff_order')) d.exec("ALTER TABLE debts ADD COLUMN tranche_payoff_order TEXT DEFAULT 'highest_rate'")
  if (!debtCols.includes('pool_ratio')) d.exec('ALTER TABLE debts ADD COLUMN pool_ratio REAL DEFAULT 0.5')
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
  debtId?: number
  noCategory?: boolean
  noSubcategory?: boolean
  limit?: number
  offset?: number
}): unknown[] {
  const d = getDb()
  const parts: string[] = ['1=1']
  const params: unknown[] = []
  if (filters.dateFrom) { parts.push('o.date >= ?'); params.push(filters.dateFrom) }
  if (filters.dateTo) { parts.push('o.date <= ?'); params.push(filters.dateTo) }
  if (filters.type) { parts.push('o.type = ?'); params.push(filters.type) }
  // Независимые условия (Б7): категория + «без подкатегории» должны работать вместе
  if (filters.noCategory) { parts.push("o.category_id IS NULL AND o.type = 'expense'") }
  if (filters.noSubcategory) { parts.push('o.subcategory_id IS NULL') }
  if (filters.categoryId) { parts.push('o.category_id = ?'); params.push(filters.categoryId) }
  if (filters.subcategoryId) { parts.push('o.subcategory_id = ?'); params.push(filters.subcategoryId) }
  if (filters.commentSearch) { parts.push('o.comment LIKE ?'); params.push(`%${filters.commentSearch}%`) }
  if (filters.amountFrom != null) { parts.push('o.amount >= ?'); params.push(filters.amountFrom) }
  if (filters.debtId != null) { parts.push('o.debt_id = ?'); params.push(filters.debtId) }
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
  goal_id?: number | null
}): number {
  const d = getDb()
  return d.transaction(() => {
    const r = d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id, goal_id)
      VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, @account_id, @comment, @debt_id, @goal_id)
    `).run({
      ...op,
      category_id: op.category_id ?? null,
      subcategory_id: op.subcategory_id ?? null,
      expense_type: op.expense_type ?? null,
      account_id: op.account_id ?? null,
      comment: op.comment ?? null,
      debt_id: op.debt_id ?? null,
      goal_id: op.goal_id ?? null,
    })
    if (op.goal_id) {
      d.prepare('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?').run(op.amount, op.goal_id)
    }
    return r.lastInsertRowid as number
  })()
}

export function importOperations(ops: Array<{
  date: string
  type: string
  amount: number
  category_id?: number | null
  subcategory_id?: number | null
  expense_type?: string | null
  comment?: string | null
}>, options?: { skipDuplicates?: boolean }): { imported: number; skipped: number } {
  const d = getDb()
  const skipDuplicates = options?.skipDuplicates ?? true
  const stmt = d.prepare(`
    INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
    VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, NULL, @comment, NULL)
  `)

  // Б9: защита от повторного импорта — ключ date|amount|comment по существующим операциям
  // в диапазоне дат импортируемого файла
  const makeKey = (date: string, amount: number, comment: string | null | undefined): string =>
    `${date}|${amount.toFixed(2)}|${comment ?? ''}`
  let existingKeys = new Set<string>()
  if (skipDuplicates && ops.length > 0) {
    const dates = ops.map(o => o.date).sort()
    const existing = d.prepare('SELECT date, amount, comment FROM operations WHERE date >= ? AND date <= ?')
      .all(dates[0], dates[dates.length - 1]) as Array<{ date: string; amount: number; comment: string | null }>
    existingKeys = new Set(existing.map(e => makeKey(e.date, e.amount, e.comment)))
  }

  const insertMany = d.transaction((rows: typeof ops) => {
    let imported = 0
    let skipped = 0
    for (const op of rows) {
      if (skipDuplicates && existingKeys.has(makeKey(op.date, op.amount, op.comment))) {
        skipped++
        continue
      }
      stmt.run({
        ...op,
        category_id: op.category_id ?? null,
        subcategory_id: op.subcategory_id ?? null,
        expense_type: op.expense_type ?? null,
        comment: op.comment ?? null,
      })
      imported++
    }
    return { imported, skipped }
  })
  return insertMany(ops) as { imported: number; skipped: number }
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
  const d = getDb()
  d.transaction(() => {
    const op = d.prepare('SELECT goal_id, amount FROM operations WHERE id = ?').get(id) as { goal_id: number | null; amount: number } | undefined
    if (op?.goal_id) {
      d.prepare('UPDATE savings_goals SET current_amount = MAX(0, current_amount - ?) WHERE id = ?').run(op.amount, op.goal_id)
    }
    d.prepare('DELETE FROM operations WHERE id = ?').run(id)
  })()
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
  if (status) return d.prepare('SELECT * FROM debts WHERE status = ? ORDER BY COALESCE(sort_order, 9999), id ASC').all(status)
  return d.prepare('SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC').all()
}

export function getDebt(id: number): unknown {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(id) as {
    id: number; debt_type: string; initial_amount: number | null
    interest_rate: number | null; loan_date: string | null; created_at: string
  } | undefined
  if (!debt) return undefined

  // accrued_interest считается на backend (Б4) — фронт не дублирует расчёт
  const today = new Date()
  let accruedInterest = 0
  if (debt.debt_type === 'dad') {
    const lastPay = d.prepare('SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?').get(debt.id) as { dt: string | null }
    const tranches = d.prepare(
      "SELECT current_balance, interest_rate, date FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
    ).all(debt.id) as Array<{ current_balance: number; interest_rate: number; date: string }>
    accruedInterest = trancheAccruedInterest(tranches, lastPay.dt, today)
  } else if (debt.interest_rate) {
    const paid = (d.prepare('SELECT COALESCE(SUM(body_part),0) as paid FROM simple_debt_payments WHERE debt_id = ?').get(debt.id) as { paid: number }).paid
    const currentBalance = Math.max(0, (debt.initial_amount || 0) - paid)
    const lastPay = d.prepare('SELECT MAX(payment_date) as dt FROM simple_debt_payments WHERE debt_id = ?').get(debt.id) as { dt: string | null }
    const startStr = lastPay.dt ?? debt.loan_date ?? debt.created_at
    const startDate = new Date(startStr + (startStr.includes('T') ? '' : 'T00:00:00'))
    const days = Math.max(0, Math.round((today.getTime() - startDate.getTime()) / 86400000))
    accruedInterest = currentBalance * debt.interest_rate * (days / 365)
  }
  return { ...debt, accrued_interest: accruedInterest }
}

export function addDebt(debt: {
  name: string
  direction: string
  debt_type: string
  initial_amount?: number | null
  interest_rate?: number | null
  payment_day?: number | null
  monthly_payment?: number | null
  category?: string | null
  loan_date?: string | null
}): number {
  const r = getDb().prepare(`
    INSERT INTO debts (name, direction, debt_type, initial_amount, interest_rate, payment_day, monthly_payment, category, loan_date)
    VALUES (@name, @direction, @debt_type, @initial_amount, @interest_rate, @payment_day, @monthly_payment, @category, @loan_date)
  `).run({
    ...debt,
    initial_amount: debt.initial_amount ?? null,
    interest_rate: debt.interest_rate ?? null,
    payment_day: debt.payment_day ?? null,
    monthly_payment: debt.monthly_payment ?? null,
    category: debt.category ?? null,
    loan_date: debt.loan_date ?? null,
  })
  return r.lastInsertRowid as number
}

export function updateDebtsOrder(orderedIds: number[]): void {
  const d = getDb()
  const upd = d.prepare('UPDATE debts SET sort_order = ? WHERE id = ?')
  d.transaction(() => { orderedIds.forEach((id, i) => upd.run(i, id)) })()
}

export function getDebtsWithBalance(): unknown[] {
  const d = getDb()
  const debts = d.prepare('SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC').all() as Array<{
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

export function getDebtsWithDetails(): unknown[] {
  const d = getDb()
  const debts = d.prepare('SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC').all() as Array<{
    id: number; debt_type: string; initial_amount: number | null; interest_rate: number | null
    overdue_interest_pool: number; created_at: string; loan_date: string | null; [key: string]: unknown
  }>
  const today = new Date()
  return debts.map(debt => {
    let currentBalance: number
    let accruedInterest: number
    let lastPaymentDateStr: string | null

    if (debt.debt_type === 'dad') {
      const row = d.prepare(
        "SELECT COALESCE(SUM(current_balance),0) as bal FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).get(debt.id) as { bal: number }
      currentBalance = row.bal

      const lastPay = d.prepare(
        'SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?'
      ).get(debt.id) as { dt: string | null }
      lastPaymentDateStr = lastPay.dt

      const tranches = d.prepare(
        "SELECT current_balance, interest_rate, date FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).all(debt.id) as Array<{ current_balance: number; interest_rate: number; date: string }>

      // Per-tranche: interest accrues from max(trancheDate, lastPaymentDate) —
      // a tranche issued after the last payment must not accrue interest for days before it existed
      accruedInterest = trancheAccruedInterest(tranches, lastPay.dt, today)
    } else {
      const row = d.prepare(
        'SELECT COALESCE(SUM(body_part),0) as paid FROM simple_debt_payments WHERE debt_id = ?'
      ).get(debt.id) as { paid: number }
      currentBalance = Math.max(0, (debt.initial_amount || 0) - row.paid)

      const lastPay = d.prepare(
        'SELECT MAX(payment_date) as dt FROM simple_debt_payments WHERE debt_id = ?'
      ).get(debt.id) as { dt: string | null }
      lastPaymentDateStr = lastPay.dt
      const interestStartStr = lastPay.dt ?? debt.loan_date ?? debt.created_at
      const lastPaymentDate = new Date(interestStartStr + (interestStartStr.includes('T') ? '' : 'T00:00:00'))

      const days = Math.max(0, Math.round((today.getTime() - lastPaymentDate.getTime()) / 86400000))
      accruedInterest = debt.interest_rate ? currentBalance * debt.interest_rate * (days / 365) : 0
    }

    // period_paid: обязательный платёж текущего периода [payDay прошлого месяца .. payDay текущего]
    // внесён — считается независимо от того, наступила ли дата платежа (Б1).
    // is_overdue: дата платежа прошла (со следующего дня, Б11) И period_paid=false.
    let periodPaid = false
    let isOverdue = false
    const payDay = debt.payment_day as number | null
    const debtStatus = debt.status as string
    if (payDay && debtStatus === 'active') {
      const { startStr, endStr, todayStr } = paymentPeriod(today, payDay)

      if (debt.debt_type === 'simple') {
        // Only mandatory payments close the period; early repayments don't count
        const paid = (d.prepare(
          "SELECT COALESCE(SUM(total_amount), 0) as total FROM simple_debt_payments WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ? AND (payment_type IS NULL OR payment_type = 'mandatory')"
        ).get(debt.id, startStr, endStr) as { total: number }).total
        periodPaid = paid >= ((debt.monthly_payment as number | null) ?? 0)
      } else {
        const sufficient = (d.prepare(
          'SELECT COUNT(*) as c FROM dad_debt_payments WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ? AND total_amount > 0 AND (overdue_added_to_pool = 0 OR marked_sufficient = 1)'
        ).get(debt.id, startStr, endStr) as { c: number }).c
        periodPaid = sufficient > 0
      }
      isOverdue = computeIsOverdue(todayStr, endStr, periodPaid)
    }

    return { ...debt, current_balance: currentBalance, accrued_interest: accruedInterest, last_payment_date: lastPaymentDateStr, is_overdue: isOverdue, period_paid: periodPaid }
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
  category?: string | null
  is_hidden?: number
  loan_date?: string | null
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

export function updateTranche(trancheId: number, data: { date?: string; interest_rate?: number; initial_amount?: number }): { ok: boolean; reason?: string } {
  const d = getDb()
  const t = d.prepare('SELECT * FROM debt_tranches WHERE id = ?').get(trancheId) as {
    initial_amount: number; current_balance: number
  } | null
  if (!t) return { ok: false, reason: 'not_found' }

  const isPartiallyPaid = t.current_balance < t.initial_amount - 0.01
  const updateData: Record<string, unknown> = {}
  if (data.date !== undefined) updateData.date = data.date
  if (data.interest_rate !== undefined) updateData.interest_rate = data.interest_rate
  if (data.initial_amount !== undefined && !isPartiallyPaid) {
    updateData.initial_amount = data.initial_amount
    updateData.current_balance = data.initial_amount
  }

  const fields = Object.keys(updateData).map(k => `${k} = @${k}`).join(', ')
  if (!fields) return { ok: true }
  d.prepare(`UPDATE debt_tranches SET ${fields} WHERE id = @id`).run({ ...updateData, id: trancheId })
  return { ok: true }
}

export function deleteTranche(trancheId: number): { ok: boolean; reason?: string } {
  const d = getDb()
  const t = d.prepare('SELECT * FROM debt_tranches WHERE id = ?').get(trancheId) as {
    initial_amount: number; current_balance: number
  } | null
  if (!t) return { ok: false, reason: 'not_found' }
  if (t.current_balance < t.initial_amount - 0.01) return { ok: false, reason: 'partially_paid' }
  d.prepare('DELETE FROM debt_tranches WHERE id = ?').run(trancheId)
  return { ok: true }
}

export function getDaysSinceLastPayment(debtId: number, asOfDate: string): { days: number; since: string } {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { debt_type: string; created_at: string }
  let since: string
  if (debt.debt_type === 'dad') {
    const row = d.prepare('SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?').get(debtId) as { dt: string | null }
    if (row.dt) {
      since = row.dt
    } else {
      const earliest = d.prepare('SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?').get(debtId) as { dt: string | null }
      since = earliest.dt ?? debt.created_at.slice(0, 10)
    }
  } else {
    const row = d.prepare('SELECT MAX(payment_date) as dt FROM simple_debt_payments WHERE debt_id = ?').get(debtId) as { dt: string | null }
    since = row.dt ?? debt.created_at.slice(0, 10)
  }
  const lastDate = new Date(since + 'T00:00:00')
  const asOf = new Date(asOfDate + 'T00:00:00')
  const days = Math.max(0, Math.round((asOf.getTime() - lastDate.getTime()) / 86400000))
  return { days, since }
}

function getDebtSettings(debt: { tranche_payoff_order?: string | null; pool_ratio?: number | null }): DadDebtSettings {
  return {
    tranchePayoffOrder: (debt.tranche_payoff_order as DadDebtSettings['tranchePayoffOrder']) ?? 'highest_rate',
    poolRatio: debt.pool_ratio ?? 0.5,
  }
}

export function processDadPayment(debtId: number, paymentAmount: number, paymentDate: string): unknown {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as {
    overdue_interest_pool: number; name: string; created_at: string; tranche_payoff_order?: string | null; pool_ratio?: number | null
  }

  // Compute last payment date: if no payments yet, use the earliest tranche date
  // (not debt.created_at — that's the DB record creation time, not the economic start date)
  const lastPayRow = d.prepare('SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?').get(debtId) as { dt: string | null }
  let lastPayDate: Date
  if (lastPayRow.dt) {
    lastPayDate = new Date(lastPayRow.dt + 'T00:00:00')
  } else {
    const earliestTranche = d.prepare('SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?').get(debtId) as { dt: string | null }
    lastPayDate = new Date((earliestTranche.dt ?? debt.created_at.slice(0, 10)) + 'T00:00:00')
  }
  const payDateObj = new Date(paymentDate + 'T00:00:00')

  const tranchesRaw = d.prepare('SELECT * FROM debt_tranches WHERE debt_id = ?').all(debtId) as Array<{
    id: number; date: string; current_balance: number; interest_rate: number; status: string
  }>

  // Per-tranche: interest accrues from max(lastPayDate, trancheDate) to paymentDate
  const tranches = tranchesRaw.map(t => {
    const trancheDate = new Date(t.date + 'T00:00:00')
    const interestStart = trancheDate > lastPayDate ? trancheDate : lastPayDate
    const daysSince = Math.max(0, Math.round((payDateObj.getTime() - interestStart.getTime()) / 86400000))
    return {
      id: t.id,
      currentBalance: t.current_balance,
      interestRate: t.interest_rate,
      status: t.status as 'active' | 'paid',
      daysSinceInterestStart: daysSince,
      date: t.date,
    }
  })

  const result = calculateDadDebtPayment(tranches, debt.overdue_interest_pool, paymentAmount, 0, getDebtSettings(debt))

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

    const opId = d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, paymentAmount, `Платёж по долгу: ${debt.name}`, debtId).lastInsertRowid
    d.prepare('UPDATE dad_debt_payments SET operation_id = ? WHERE id = ?').run(opId, paymentId)

    return paymentId
  })

  const newPaymentId = processPayment() as number
  return { ...result, paymentId: newPaymentId }
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

export function markDadPaymentSufficient(paymentId: number): void {
  getDb().prepare('UPDATE dad_debt_payments SET marked_sufficient = 1 WHERE id = ?').run(paymentId)
}

export function getSimpleDebtPayments(debtId: number): unknown[] {
  return getDb().prepare('SELECT * FROM simple_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC').all(debtId)
}

export function processSimplePayment(debtId: number, amount: number, paymentDate: string, interestPart = 0, paymentType: 'mandatory' | 'early' = 'mandatory'): { overpayment: number } {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { initial_amount: number; name: string }
  return d.transaction(() => {
    // Б5: тело платежа ограничено остатком долга, излишек возвращается как overpayment
    const paidBefore = (d.prepare('SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?').get(debtId) as { total: number }).total
    const remaining = Math.max(0, (debt.initial_amount || 0) - paidBefore)
    const { bodyPart, overpayment } = splitSimplePayment(amount, interestPart, remaining)
    const paymentId = d.prepare('INSERT INTO simple_debt_payments (debt_id, payment_date, total_amount, interest_part, body_part, payment_type) VALUES (?, ?, ?, ?, ?, ?)').run(debtId, paymentDate, amount, interestPart, bodyPart, paymentType).lastInsertRowid
    const paid = (d.prepare('SELECT SUM(body_part) as total FROM simple_debt_payments WHERE debt_id = ?').get(debtId) as { total: number }).total || 0
    if (paid >= debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(debtId)
    }
    const opId = d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, amount, `Платёж по долгу: ${debt.name}`, debtId).lastInsertRowid
    d.prepare('UPDATE simple_debt_payments SET operation_id = ? WHERE id = ?').run(opId, paymentId)
    return { overpayment }
  })()
}

// Full replay of all dad payments from scratch to ensure consistency after any edit/delete.
// Resets tranches to initial_amount, clears tranche payment records, re-applies each payment
// in chronological order using calculateDadDebtPayment. Does NOT touch the operations table.
function replayDadPayments(d: ReturnType<typeof getDb>, debtId: number): void {
  d.prepare('UPDATE debt_tranches SET current_balance = initial_amount, status = \'active\' WHERE debt_id = ?').run(debtId)
  d.prepare('UPDATE debts SET overdue_interest_pool = 0 WHERE id = ?').run(debtId)
  d.prepare('DELETE FROM dad_debt_tranche_payments WHERE payment_id IN (SELECT id FROM dad_debt_payments WHERE debt_id = ?)').run(debtId)

  const debtRow = d.prepare('SELECT tranche_payoff_order, pool_ratio FROM debts WHERE id = ?').get(debtId) as { tranche_payoff_order?: string | null; pool_ratio?: number | null }
  const settings = getDebtSettings(debtRow)

  const payments = d.prepare('SELECT * FROM dad_debt_payments WHERE debt_id = ? ORDER BY payment_date ASC, id ASC').all(debtId) as Array<{
    id: number; payment_date: string; total_amount: number
  }>
  const earliestTranche = d.prepare('SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?').get(debtId) as { dt: string | null }

  let currentPool = 0
  for (let i = 0; i < payments.length; i++) {
    const pay = payments[i]
    const payDateObj = new Date(pay.payment_date + 'T00:00:00')
    const lastPayDate = i === 0
      ? new Date((earliestTranche.dt ?? pay.payment_date) + 'T00:00:00')
      : new Date(payments[i - 1].payment_date + 'T00:00:00')

    const tranchesRaw = d.prepare('SELECT * FROM debt_tranches WHERE debt_id = ?').all(debtId) as Array<{
      id: number; date: string; current_balance: number; interest_rate: number; status: string
    }>
    const tranches = tranchesRaw.map(t => {
      const trancheDate = new Date(t.date + 'T00:00:00')
      const interestStart = trancheDate > lastPayDate ? trancheDate : lastPayDate
      const daysSince = Math.max(0, Math.round((payDateObj.getTime() - interestStart.getTime()) / 86400000))
      return { id: t.id, currentBalance: t.current_balance, interestRate: t.interest_rate, status: t.status as 'active' | 'paid', daysSinceInterestStart: daysSince, date: t.date }
    })

    const result = calculateDadDebtPayment(tranches, currentPool, pay.total_amount, 0, settings)

    d.prepare('UPDATE dad_debt_payments SET interest_covered = ?, pool_covered = ?, body_covered = ?, overdue_added_to_pool = ? WHERE id = ?')
      .run(result.interestCovered, result.poolCovered, result.bodyCovered, result.overdueAddedToPool, pay.id)

    for (const upd of result.trancheUpdates) {
      const prev = tranches.find(t => t.id === upd.id)
      const applied = prev ? prev.currentBalance - upd.newBalance : 0
      if (applied > 0) {
        d.prepare('INSERT INTO dad_debt_tranche_payments (payment_id, tranche_id, amount_applied) VALUES (?, ?, ?)').run(pay.id, upd.id, applied)
      }
      d.prepare('UPDATE debt_tranches SET current_balance = ?, status = ? WHERE id = ?').run(upd.newBalance, upd.status, upd.id)
    }
    currentPool = result.newOverduePool
  }
  d.prepare('UPDATE debts SET overdue_interest_pool = ? WHERE id = ?').run(currentPool, debtId)
}

export function deleteDadPayment(paymentId: number): void {
  const d = getDb()
  d.transaction(() => {
    const payment = d.prepare('SELECT * FROM dad_debt_payments WHERE id = ?').get(paymentId) as {
      debt_id: number; operation_id: number | null; total_amount: number; payment_date: string
    }
    if (payment.operation_id) {
      d.prepare('DELETE FROM operations WHERE id = ?').run(payment.operation_id)
    } else {
      d.prepare("DELETE FROM operations WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1")
        .run(payment.debt_id, payment.payment_date, payment.total_amount)
    }
    d.prepare('DELETE FROM dad_debt_tranche_payments WHERE payment_id = ?').run(paymentId)
    d.prepare('DELETE FROM dad_debt_payments WHERE id = ?').run(paymentId)
    replayDadPayments(d, payment.debt_id)
  })()
}

export function updateDadPayment(paymentId: number, newDate: string, newAmount: number): void {
  const d = getDb()
  d.transaction(() => {
    const payment = d.prepare('SELECT * FROM dad_debt_payments WHERE id = ?').get(paymentId) as {
      debt_id: number; operation_id: number | null; payment_date: string; total_amount: number
    }
    d.prepare('UPDATE dad_debt_payments SET payment_date = ?, total_amount = ? WHERE id = ?').run(newDate, newAmount, paymentId)
    if (payment.operation_id) {
      d.prepare('UPDATE operations SET date = ?, amount = ? WHERE id = ?').run(newDate, newAmount, payment.operation_id)
    } else {
      d.prepare("UPDATE operations SET date = ?, amount = ? WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1")
        .run(newDate, newAmount, payment.debt_id, payment.payment_date, payment.total_amount)
    }
    replayDadPayments(d, payment.debt_id)
  })()
}

export function deleteSimpleDebtPayment(paymentId: number): void {
  const d = getDb()
  d.transaction(() => {
    const payment = d.prepare('SELECT * FROM simple_debt_payments WHERE id = ?').get(paymentId) as {
      id: number; debt_id: number; total_amount: number; payment_date: string; operation_id: number | null
    }
    const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(payment.debt_id) as { initial_amount: number }
    if (payment.operation_id) {
      d.prepare('DELETE FROM operations WHERE id = ?').run(payment.operation_id)
    } else {
      d.prepare("DELETE FROM operations WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1")
        .run(payment.debt_id, payment.payment_date, payment.total_amount)
    }
    d.prepare('DELETE FROM simple_debt_payments WHERE id = ?').run(paymentId)
    // Reopen debt if it was closed
    const paid = (d.prepare('SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?').get(payment.debt_id) as { total: number }).total
    if (paid < debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'active' WHERE id = ?").run(payment.debt_id)
    }
  })()
}

export function updateSimpleDebtPayment(paymentId: number, newAmount: number, newDate: string, newInterestPart: number): void {
  const d = getDb()
  d.transaction(() => {
    const payment = d.prepare('SELECT * FROM simple_debt_payments WHERE id = ?').get(paymentId) as {
      id: number; debt_id: number; operation_id: number | null; payment_date: string; total_amount: number
    }
    const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(payment.debt_id) as { initial_amount: number }
    const newBodyPart = newAmount - newInterestPart
    d.prepare('UPDATE simple_debt_payments SET total_amount = ?, payment_date = ?, interest_part = ?, body_part = ? WHERE id = ?')
      .run(newAmount, newDate, newInterestPart, newBodyPart, paymentId)
    if (payment.operation_id) {
      d.prepare('UPDATE operations SET amount = ?, date = ? WHERE id = ?').run(newAmount, newDate, payment.operation_id)
    } else {
      d.prepare("UPDATE operations SET amount = ?, date = ? WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1")
        .run(newAmount, newDate, payment.debt_id, payment.payment_date, payment.total_amount)
    }
    const paid = (d.prepare('SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?').get(payment.debt_id) as { total: number }).total
    if (paid >= debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(payment.debt_id)
    } else {
      d.prepare("UPDATE debts SET status = 'active' WHERE id = ?").run(payment.debt_id)
    }
  })()
}

export function hasDadPaymentsAfter(paymentId: number): boolean {
  const d = getDb()
  const payment = d.prepare('SELECT * FROM dad_debt_payments WHERE id = ?').get(paymentId) as { debt_id: number; payment_date: string }
  const count = (d.prepare('SELECT COUNT(*) as c FROM dad_debt_payments WHERE debt_id = ? AND payment_date > ?').get(payment.debt_id, payment.payment_date) as { c: number }).c
  return count > 0
}

export function hasSimplePaymentsAfter(paymentId: number): boolean {
  const d = getDb()
  const payment = d.prepare('SELECT * FROM simple_debt_payments WHERE id = ?').get(paymentId) as { debt_id: number; payment_date: string }
  const count = (d.prepare('SELECT COUNT(*) as c FROM simple_debt_payments WHERE debt_id = ? AND payment_date > ?').get(payment.debt_id, payment.payment_date) as { c: number }).c
  return count > 0
}

export function getDadForecast(debtId: number, monthlyPayment: number): unknown[] {
  const d = getDb()
  const debt = d.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as { overdue_interest_pool: number; tranche_payoff_order?: string | null; pool_ratio?: number | null }
  const tranchesRaw = d.prepare('SELECT * FROM debt_tranches WHERE debt_id = ?').all(debtId) as Array<{
    id: number; date: string; current_balance: number; interest_rate: number; status: string
  }>
  const tranches = tranchesRaw.map(t => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status as 'active' | 'paid',
    date: t.date,
  }))
  return getForecastPayments(tranches, debt.overdue_interest_pool, monthlyPayment, 120, getDebtSettings(debt))
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
// Recurring Operations
// ──────────────────────────────────────────────────────────────

export function getRecurringOperations(activeOnly = false): unknown[] {
  if (activeOnly) return getDb().prepare('SELECT * FROM recurring_operations WHERE active = 1 ORDER BY day_of_month ASC').all()
  return getDb().prepare('SELECT * FROM recurring_operations ORDER BY day_of_month ASC').all()
}

export function addRecurringOperation(r: {
  type: string; amount: number; category_id?: number | null; subcategory_id?: number | null
  expense_type?: string | null; day_of_month: number; comment?: string | null
}): number {
  const res = getDb().prepare(`
    INSERT INTO recurring_operations (type, amount, category_id, subcategory_id, expense_type, day_of_month, comment)
    VALUES (@type, @amount, @category_id, @subcategory_id, @expense_type, @day_of_month, @comment)
  `).run({
    ...r,
    category_id: r.category_id ?? null,
    subcategory_id: r.subcategory_id ?? null,
    expense_type: r.expense_type ?? null,
    comment: r.comment ?? null,
  })
  return res.lastInsertRowid as number
}

export function updateRecurringOperation(id: number, data: {
  amount?: number; category_id?: number | null; subcategory_id?: number | null
  expense_type?: string | null; day_of_month?: number; comment?: string | null; active?: number
}): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  if (!fields) return
  getDb().prepare(`UPDATE recurring_operations SET ${fields} WHERE id = @id`).run({ ...data, id })
}

export function deleteRecurringOperation(id: number): void {
  getDb().prepare('DELETE FROM recurring_operations WHERE id = ?').run(id)
}

export function getPendingRecurringOperations(): unknown[] {
  const d = getDb()
  const currentMonth = fmtDateLocal(new Date()).slice(0, 7) // YYYY-MM
  return d.prepare(`
    SELECT r.*, c.name as category_name, c.color as category_color
    FROM recurring_operations r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.active = 1 AND (r.last_created IS NULL OR strftime('%Y-%m', r.last_created) < ?)
  `).all(currentMonth)
}

export function confirmRecurringOperation(id: number, date: string): void {
  const d = getDb()
  d.transaction(() => {
    const r = d.prepare('SELECT * FROM recurring_operations WHERE id = ?').get(id) as {
      type: string; amount: number; category_id: number | null; subcategory_id: number | null
      expense_type: string | null; comment: string | null
    }
    d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, NULL, @comment, NULL)
    `).run({
      date, type: r.type, amount: r.amount,
      category_id: r.category_id ?? null,
      subcategory_id: r.subcategory_id ?? null,
      expense_type: r.expense_type ?? null,
      comment: r.comment ?? null,
    })
    d.prepare('UPDATE recurring_operations SET last_created = ? WHERE id = ?').run(date, id)
  })()
}

// ──────────────────────────────────────────────────────────────
// Savings Goals
// ──────────────────────────────────────────────────────────────

export function getSavingsGoals(): unknown[] {
  return getDb().prepare("SELECT * FROM savings_goals ORDER BY created_at DESC").all()
}

export function addSavingsGoal(goal: {
  name: string; target_amount: number; color?: string; target_date?: string | null
}): number {
  const res = getDb().prepare(`
    INSERT INTO savings_goals (name, target_amount, color, target_date)
    VALUES (@name, @target_amount, @color, @target_date)
  `).run({
    name: goal.name,
    target_amount: goal.target_amount,
    color: goal.color ?? '#22C55E',
    target_date: goal.target_date ?? null,
  })
  return res.lastInsertRowid as number
}

export function updateSavingsGoal(id: number, data: {
  name?: string; target_amount?: number; current_amount?: number
  color?: string; target_date?: string | null; status?: string
}): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  if (!fields) return
  getDb().prepare(`UPDATE savings_goals SET ${fields} WHERE id = @id`).run({ ...data, id })
}

export function deleteSavingsGoal(id: number): void {
  getDb().prepare('DELETE FROM savings_goals WHERE id = ?').run(id)
}

// ──────────────────────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────────────────────

export function getSummary(dateFrom: string, dateTo: string, expenseType?: string): unknown {
  const d = getDb()
  const income = (d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo) as { total: number }).total
  const etClause = expenseType ? ' AND expense_type = ?' : ''
  const etParams = expenseType ? [expenseType] : []
  const expense = (d.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense'${etClause} AND date >= ? AND date <= ?`).get(...etParams, dateFrom, dateTo) as { total: number }).total
  // debt_op — платежи по долгам; учитываются в балансе, но не имеют expense_type, поэтому отдельно
  const debtOps = expenseType
    ? 0
    : (d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='debt_op' AND date >= ? AND date <= ?").get(dateFrom, dateTo) as { total: number }).total
  const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)
  return { income, expense, debtOps, balance: income - expense - debtOps, avgPerDay: expense / days, avgPerDayWithDebt: (expense + debtOps) / days }
}

export function getExpensesByCategory(dateFrom: string, dateTo: string, expenseType?: string): unknown[] {
  const etClause = expenseType ? ' AND o.expense_type = ?' : ''
  const etParams = expenseType ? [expenseType] : []
  return getDb().prepare(`
    SELECT COALESCE(c.id, -1) as id, COALESCE(c.name, 'Без категории') as name, COALESCE(c.color, '#6B7280') as color, SUM(o.amount) as total
    FROM operations o
    LEFT JOIN categories c ON o.category_id = c.id
    WHERE o.type = 'expense'${etClause} AND o.date >= ? AND o.date <= ?
    GROUP BY COALESCE(c.id, -1) ORDER BY total DESC
  `).all(...etParams, dateFrom, dateTo)
}

export function getExpensesBySubcategory(categoryId: number, dateFrom: string, dateTo: string, expenseType?: string): unknown[] {
  const etClause = expenseType ? ' AND o.expense_type = ?' : ''
  const etParams = expenseType ? [expenseType] : []
  return getDb().prepare(`
    SELECT COALESCE(s.id, -1) as id, COALESCE(s.name, 'Без подкатегории') as name, SUM(o.amount) as total
    FROM operations o
    LEFT JOIN subcategories s ON o.subcategory_id = s.id
    WHERE o.type = 'expense' AND o.category_id = ?${etClause} AND o.date >= ? AND o.date <= ?
    GROUP BY COALESCE(s.id, -1) ORDER BY total DESC
  `).all(categoryId, ...etParams, dateFrom, dateTo)
}

export function getBigExpensesBreakdown(dateFrom: string, dateTo: string): unknown[] {
  return getDb().prepare(`
    SELECT id, COALESCE(comment, date) as label, amount
    FROM operations
    WHERE type = 'expense' AND expense_type = 'big' AND date >= ? AND date <= ?
    ORDER BY amount DESC
  `).all(dateFrom, dateTo)
}

export function getDailyExpenses(dateFrom: string, dateTo: string, expenseType?: string): unknown[] {
  const etFilter = expenseType ? ' AND expense_type = ?' : ''
  const etParams = expenseType ? [expenseType] : []
  return getDb().prepare(`
    SELECT date,
      SUM(CASE WHEN type='expense'${etFilter} THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income
    FROM operations WHERE date >= ? AND date <= ?
    GROUP BY date ORDER BY date ASC
  `).all(...etParams, dateFrom, dateTo)
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

  // Manual mandatory expense items (rent, utilities, etc.)
  const manualItems = d.prepare('SELECT * FROM mandatory_expense_plan WHERE year = ? AND month = ? ORDER BY id ASC').all(year, month) as Array<{
    id: number; category: string; planned_amount: number; actual_amount: number | null
  }>

  // Auto: active debts with monthly_payment (included per spec, even if hidden)
  const debtItems = d.prepare("SELECT id, name, monthly_payment, debt_type FROM debts WHERE status = 'active' AND direction = 'i_owe' AND monthly_payment IS NOT NULL AND monthly_payment > 0").all() as Array<{
    id: number; name: string; monthly_payment: number; debt_type: string
  }>

  const manualTotal = manualItems.reduce((s, item) => s + (item.actual_amount ?? item.planned_amount), 0)
  const debtTotal = debtItems.reduce((s, debt) => s + debt.monthly_payment, 0)
  const mandatory = manualTotal + debtTotal
  const dailyBudget = (income - mandatory) / lastDay

  // day_expenses includes both expense and debt_op
  const dailyRows = d.prepare(`
    SELECT date, SUM(CASE WHEN type='expense' OR type='debt_op' THEN amount ELSE 0 END) as day_expenses
    FROM operations WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo) as Array<{ date: string; day_expenses: number }>

  const expensesByDate = new Map(dailyRows.map(r => [r.date, r.day_expenses]))
  let prevSaldo = 0
  const journal: Array<{ date: string; dayExpenses: number; cumLimit: number; saldo: number }> = []
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayExpenses = expensesByDate.get(dateStr) ?? 0
    const cumLimit = day === 1 ? dailyBudget : prevSaldo + dailyBudget
    const saldo = cumLimit - dayExpenses
    journal.push({
      date: dateStr,
      dayExpenses,
      cumLimit: Math.round(cumLimit * 100) / 100,
      saldo: Math.round(saldo * 100) / 100
    })
    prevSaldo = saldo
  }

  const mandatoryItems = [
    ...manualItems.map(item => ({
      id: item.id,
      category: item.category,
      plannedAmount: item.planned_amount,
      actualAmount: item.actual_amount,
      isDebtLinked: false,
      debtId: null as number | null,
    })),
    ...debtItems.map(debt => {
      const table = debt.debt_type === 'dad' ? 'dad_debt_payments' : 'simple_debt_payments'
      const row = d.prepare(`SELECT COALESCE(SUM(total_amount),0) as paid FROM ${table} WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ?`).get(debt.id, dateFrom, dateTo) as { paid: number }
      return {
        id: null as number | null,
        category: debt.name,
        plannedAmount: debt.monthly_payment,
        actualAmount: row.paid > 0 ? row.paid : null,
        isDebtLinked: true,
        debtId: debt.id,
      }
    }),
  ]

  return { income, mandatory, dailyBudget, journal, dateFrom, dateTo, mandatoryItems }
}

export function getMandatoryExpensePlan(year: number, month: number): unknown[] {
  return getDb().prepare('SELECT * FROM mandatory_expense_plan WHERE year = ? AND month = ? ORDER BY id ASC').all(year, month)
}

export function addMandatoryExpenseItem(year: number, month: number, category: string, plannedAmount: number): number {
  const r = getDb().prepare('INSERT INTO mandatory_expense_plan (year, month, category, planned_amount) VALUES (?, ?, ?, ?)').run(year, month, category, plannedAmount)
  return r.lastInsertRowid as number
}

export function updateMandatoryExpenseItem(id: number, data: { planned_amount?: number; actual_amount?: number | null; category?: string }): void {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `${k} = @${k}`).join(', ')
  if (!fields) return
  getDb().prepare(`UPDATE mandatory_expense_plan SET ${fields} WHERE id = @id`).run({ ...data, id })
}

export function deleteMandatoryExpenseItem(id: number): void {
  getDb().prepare('DELETE FROM mandatory_expense_plan WHERE id = ?').run(id)
}

// ──────────────────────────────────────────────────────────────
// Savings Accounts
// ──────────────────────────────────────────────────────────────

export interface SavingsAccountRow {
  id: number; name: string; balance: number; interest_rate: number
  interest_mode: string; payout_period: string
  goal_name: string | null; goal_amount: number | null; goal_date: string | null
  auto_contribute_pct: number | null; notify_contribution: number; notify_day: number | null
  color: string; sort_order: number; status: string; opened_at: string; created_at: string
}

function calcAccruedInterest(account: SavingsAccountRow, asOf: Date): number {
  const d = getDb()
  // Find date of last interest transaction or opened_at
  const lastInt = d.prepare(
    "SELECT MAX(date) as dt FROM savings_transactions WHERE account_id = ? AND type = 'interest'"
  ).get(account.id) as { dt: string | null }
  const sinceStr = (lastInt.dt ?? account.opened_at).slice(0, 10)
  // Б6: проценты по фактическим дневным остаткам, а не по текущему балансу за весь период
  const txs = d.prepare(
    'SELECT type, amount, date FROM savings_transactions WHERE account_id = ? AND date > ? ORDER BY date ASC, id ASC'
  ).all(account.id, sinceStr) as SavingsTxLike[]
  return dailySavingsInterest(account.balance, account.interest_rate, account.interest_mode, sinceStr, asOf, txs)
}

export function getSavingsAccounts(): unknown[] {
  const d = getDb()
  const accounts = d.prepare("SELECT * FROM savings_accounts WHERE status = 'active' ORDER BY sort_order ASC, id ASC").all() as SavingsAccountRow[]
  const today = new Date()
  return accounts.map(a => ({
    ...a,
    accrued_interest: calcAccruedInterest(a, today),
  }))
}

export function getSavingsAccount(id: number): unknown {
  const d = getDb()
  const a = d.prepare('SELECT * FROM savings_accounts WHERE id = ?').get(id) as SavingsAccountRow | undefined
  if (!a) return null
  return { ...a, accrued_interest: calcAccruedInterest(a, new Date()) }
}

export function addSavingsAccount(data: {
  name: string; interest_rate: number; interest_mode?: string; payout_period?: string
  goal_name?: string | null; goal_amount?: number | null; goal_date?: string | null
  auto_contribute_pct?: number | null; notify_contribution?: number; notify_day?: number | null
  color?: string; opened_at?: string; initial_balance?: number
}): number {
  const d = getDb()
  return d.transaction(() => {
    const id = d.prepare(`
      INSERT INTO savings_accounts (name, balance, interest_rate, interest_mode, payout_period, goal_name, goal_amount, goal_date, auto_contribute_pct, notify_contribution, notify_day, color, opened_at)
      VALUES (@name, @balance, @interest_rate, @interest_mode, @payout_period, @goal_name, @goal_amount, @goal_date, @auto_contribute_pct, @notify_contribution, @notify_day, @color, @opened_at)
    `).run({
      name: data.name,
      balance: data.initial_balance ?? 0,
      interest_rate: data.interest_rate,
      interest_mode: data.interest_mode ?? 'capitalize',
      payout_period: data.payout_period ?? 'monthly',
      goal_name: data.goal_name ?? null,
      goal_amount: data.goal_amount ?? null,
      goal_date: data.goal_date ?? null,
      auto_contribute_pct: data.auto_contribute_pct ?? null,
      notify_contribution: data.notify_contribution ?? 0,
      notify_day: data.notify_day ?? null,
      color: data.color ?? '#22C55E',
      opened_at: data.opened_at ?? fmtDateLocal(new Date()),
    }).lastInsertRowid as number

    if (data.initial_balance && data.initial_balance > 0) {
      const dateStr = data.opened_at ?? fmtDateLocal(new Date())
      const txId = d.prepare(
        "INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'deposit', ?, ?, 'Начальный баланс')"
      ).run(id, data.initial_balance, dateStr).lastInsertRowid
      // Record as expense so the money leaves the wallet
      let catId = (d.prepare("SELECT id FROM categories WHERE name = 'Накопления' AND type = 'expense'").get() as { id: number } | undefined)?.id
      if (!catId) {
        catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Накопления', 'expense', '#22C55E', 'piggy-bank')").run().lastInsertRowid as number
      }
      const opId = d.prepare("INSERT INTO operations (date, type, amount, category_id, expense_type, comment) VALUES (?, 'expense', ?, ?, NULL, ?)").run(dateStr, data.initial_balance, catId, 'Начальный баланс счёта').lastInsertRowid
      d.prepare('UPDATE savings_transactions SET linked_operation_id = ? WHERE id = ?').run(opId, txId)
    }
    return id
  })() as number
}

export function updateSavingsAccount(id: number, data: Record<string, unknown>): void {
  const allowed = ['name', 'interest_rate', 'interest_mode', 'payout_period', 'goal_name', 'goal_amount', 'goal_date', 'auto_contribute_pct', 'notify_contribution', 'notify_day', 'color', 'status', 'sort_order']
  const updates = Object.entries(data).filter(([k]) => allowed.includes(k))
  if (!updates.length) return
  const fields = updates.map(([k]) => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE savings_accounts SET ${fields} WHERE id = @id`).run({ ...Object.fromEntries(updates), id })
}

export function deleteSavingsAccount(id: number): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare('DELETE FROM savings_transactions WHERE account_id = ?').run(id)
    d.prepare('DELETE FROM savings_accounts WHERE id = ?').run(id)
  })()
}

export function getSavingsTransactions(accountId: number): unknown[] {
  return getDb().prepare('SELECT * FROM savings_transactions WHERE account_id = ? ORDER BY date DESC, id DESC').all(accountId)
}

export function addSavingsDeposit(accountId: number, amount: number, date: string, comment?: string): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'deposit', ?, ?, ?)").run(accountId, amount, date, comment ?? null)
    d.prepare('UPDATE savings_accounts SET balance = balance + ? WHERE id = ?').run(amount, accountId)
    // Also record as expense operation with category "Накопления"
    let catId = (d.prepare("SELECT id FROM categories WHERE name = 'Накопления' AND type = 'expense'").get() as { id: number } | undefined)?.id
    if (!catId) {
      catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Накопления', 'expense', '#22C55E', 'piggy-bank')").run().lastInsertRowid as number
    }
    const opId = d.prepare("INSERT INTO operations (date, type, amount, category_id, expense_type, comment) VALUES (?, 'expense', ?, ?, NULL, ?)").run(date, amount, catId, comment ?? 'Пополнение накопительного счёта').lastInsertRowid
    d.prepare('UPDATE savings_transactions SET linked_operation_id = ? WHERE account_id = ? AND type = ? AND date = ? AND linked_operation_id IS NULL ORDER BY id DESC LIMIT 1').run(opId, accountId, 'deposit', date)
  })()
}

export function addSavingsWithdrawal(accountId: number, amount: number, date: string, comment?: string): void {
  const d = getDb()
  d.transaction(() => {
    const acc = d.prepare('SELECT balance FROM savings_accounts WHERE id = ?').get(accountId) as { balance: number }
    if (acc.balance < amount) throw new Error('Insufficient balance')
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'withdrawal', ?, ?, ?)").run(accountId, amount, date, comment ?? null)
    d.prepare('UPDATE savings_accounts SET balance = balance - ? WHERE id = ?').run(amount, accountId)
    // Record as income
    let catId = (d.prepare("SELECT id FROM categories WHERE name = 'Снятие с накоплений' AND type = 'income'").get() as { id: number } | undefined)?.id
    if (!catId) {
      catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Снятие с накоплений', 'income', '#6366F1', 'wallet')").run().lastInsertRowid as number
    }
    const opId = d.prepare("INSERT INTO operations (date, type, amount, category_id, comment) VALUES (?, 'income', ?, ?, ?)").run(date, amount, catId, comment ?? 'Снятие с накопительного счёта').lastInsertRowid
    d.prepare('UPDATE savings_transactions SET linked_operation_id = ? WHERE account_id = ? AND type = ? AND date = ? AND linked_operation_id IS NULL ORDER BY id DESC LIMIT 1').run(opId, accountId, 'withdrawal', date)
  })()
}

export function applyAccruedInterest(accountId: number): void {
  const d = getDb()
  const acc = d.prepare('SELECT * FROM savings_accounts WHERE id = ?').get(accountId) as SavingsAccountRow | undefined
  if (!acc) return
  const today = new Date()
  const amount = calcAccruedInterest(acc, today)
  if (amount < 0.01) return
  const dateStr = fmtDateLocal(today)

  d.transaction(() => {
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'interest', ?, ?, 'Начисление процентов')").run(accountId, amount, dateStr)
    if (acc.interest_mode === 'capitalize') {
      d.prepare('UPDATE savings_accounts SET balance = balance + ? WHERE id = ?').run(amount, accountId)
    } else {
      // Payout: add as income operation
      let catId = (d.prepare("SELECT id FROM categories WHERE name = 'Проценты по счёту' AND type = 'income'").get() as { id: number } | undefined)?.id
      if (!catId) {
        catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Проценты по счёту', 'income', '#F59E0B', 'percent')").run().lastInsertRowid as number
      }
      d.prepare("INSERT INTO operations (date, type, amount, category_id, comment) VALUES (?, 'income', ?, ?, 'Проценты по накопительному счёту')").run(dateStr, amount, catId)
    }
  })()
}

export function getPendingSavingsInterest(): unknown[] {
  const d = getDb()
  const accounts = d.prepare("SELECT * FROM savings_accounts WHERE status = 'active' AND interest_rate > 0").all() as SavingsAccountRow[]
  const today = new Date()
  const result = []
  for (const acc of accounts) {
    const lastInt = d.prepare(
      "SELECT MAX(date) as dt FROM savings_transactions WHERE account_id = ? AND type = 'interest'"
    ).get(acc.id) as { dt: string | null }
    const sinceStr = (lastInt.dt ?? acc.opened_at).slice(0, 10)
    const sinceDate = new Date(sinceStr + 'T00:00:00')
    const days = Math.round((today.getTime() - sinceDate.getTime()) / 86400000)
    if (days < 1) continue
    const amount = calcAccruedInterest(acc, today)
    if (amount < 0.01) continue

    // Check payout_period timing
    if (acc.payout_period === 'monthly') {
      // Only show if last application was in a previous month
      const lastMonth = sinceDate.getFullYear() * 12 + sinceDate.getMonth()
      const thisMonth = today.getFullYear() * 12 + today.getMonth()
      if (thisMonth <= lastMonth) continue
    }
    result.push({ id: acc.id, name: acc.name, days, amount, accrued_interest: amount })
  }
  return result
}

export function getSavingsForecast(accountId: number, monthlyContribution: number, months: number): unknown[] {
  const d = getDb()
  const acc = d.prepare('SELECT * FROM savings_accounts WHERE id = ?').get(accountId) as SavingsAccountRow | undefined
  if (!acc) return []
  let balance = acc.balance + calcAccruedInterest(acc, new Date())
  const result = []
  for (let m = 1; m <= months; m++) {
    balance += monthlyContribution
    const monthlyInterest = balance * acc.interest_rate / 12
    if (acc.interest_mode === 'capitalize') {
      balance += monthlyInterest
    }
    result.push({
      month: m,
      contribution: monthlyContribution,
      interest: monthlyInterest,
      balance,
      progress: acc.goal_amount ? balance / acc.goal_amount : null,
    })
    if (acc.goal_amount && balance >= acc.goal_amount) break
  }
  return result
}

export function updateSavingsAccountsOrder(ids: number[]): void {
  const d = getDb()
  const stmt = d.prepare('UPDATE savings_accounts SET sort_order = ? WHERE id = ?')
  ids.forEach((id, i) => stmt.run(i, id))
}

export function getAccountsForAutoContribute(): unknown[] {
  return getDb().prepare("SELECT id, name, auto_contribute_pct FROM savings_accounts WHERE status = 'active' AND auto_contribute_pct > 0").all()
}

// ──────────────────────────────────────────────────────────────
// Разовая разметка исторических досрочных платежей (Б12)
// ──────────────────────────────────────────────────────────────

// Кандидаты в «досрочные»: mandatory-платежи с суммой > 2 × monthly_payment долга.
// Показывается один раз после обновления (флаг early_markup_done в budget_settings).
export function getEarlyPaymentCandidates(): unknown[] {
  const d = getDb()
  const done = d.prepare("SELECT value FROM budget_settings WHERE key = 'early_markup_done'").get() as { value: string } | undefined
  if (done?.value === '1') return []
  return d.prepare(`
    SELECT p.id, p.debt_id, p.payment_date, p.total_amount, d.name as debt_name, d.monthly_payment
    FROM simple_debt_payments p
    JOIN debts d ON p.debt_id = d.id
    WHERE (p.payment_type IS NULL OR p.payment_type = 'mandatory')
      AND d.monthly_payment IS NOT NULL AND d.monthly_payment > 0
      AND p.total_amount > 2 * d.monthly_payment
    ORDER BY p.payment_date ASC
  `).all()
}

export function markPaymentsEarly(paymentIds: number[]): void {
  const d = getDb()
  d.transaction(() => {
    const stmt = d.prepare("UPDATE simple_debt_payments SET payment_type = 'early' WHERE id = ?")
    for (const id of paymentIds) stmt.run(id)
    d.prepare("INSERT OR REPLACE INTO budget_settings (key, value) VALUES ('early_markup_done', '1')").run()
  })()
}

// ──────────────────────────────────────────────────────────────
// Backup / Export
// ──────────────────────────────────────────────────────────────

export async function exportDb(targetPath: string): Promise<void> {
  const d = getDb()
  await d.backup(targetPath)
}

export function importDb(sourcePath: string): void {
  if (db) { db.close(); db = null as unknown as Database.Database }
  fs.copyFileSync(sourcePath, DB_PATH)
  getDb()
}

export function getDbPath(): string {
  return DB_PATH
}
