"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
function calculateDadDebtPayment(tranches, overduePool, paymentAmount, daysSinceLastPayment) {
  const activeTranches = tranches.filter((t) => t.status === "active");
  const trancheInterests = activeTranches.map((t) => ({
    tranche: t,
    interest: t.currentBalance * t.interestRate * (daysSinceLastPayment / 365)
  }));
  const totalCurrentInterest = trancheInterests.reduce((sum, ti) => sum + ti.interest, 0);
  const remainder = paymentAmount - totalCurrentInterest;
  let interestCovered;
  let poolCovered = 0;
  let bodyCovered = 0;
  let overdueAddedToPool = 0;
  let newOverduePool = overduePool;
  if (remainder >= 0) {
    interestCovered = totalCurrentInterest;
    if (overduePool > 0) {
      const poolAllocation = Math.min(remainder * 0.5, overduePool);
      poolCovered = poolAllocation;
      newOverduePool = overduePool - poolAllocation;
      bodyCovered = remainder - poolAllocation;
    } else {
      bodyCovered = remainder;
      newOverduePool = 0;
    }
  } else {
    interestCovered = paymentAmount;
    overdueAddedToPool = totalCurrentInterest - paymentAmount;
    newOverduePool = overduePool + overdueAddedToPool;
    bodyCovered = 0;
  }
  const sortedTranches = [...activeTranches].sort((a, b) => b.interestRate - a.interestRate);
  const trancheUpdates = [];
  let remainingBody = bodyCovered;
  for (const t of sortedTranches) {
    if (remainingBody <= 0) {
      trancheUpdates.push({ id: t.id, newBalance: t.currentBalance, status: t.status });
      continue;
    }
    if (remainingBody >= t.currentBalance) {
      remainingBody -= t.currentBalance;
      trancheUpdates.push({ id: t.id, newBalance: 0, status: "paid" });
    } else {
      trancheUpdates.push({ id: t.id, newBalance: t.currentBalance - remainingBody, status: "active" });
      remainingBody = 0;
    }
  }
  for (const t of tranches.filter((t2) => t2.status === "paid")) {
    if (!trancheUpdates.find((u) => u.id === t.id)) {
      trancheUpdates.push({ id: t.id, newBalance: t.currentBalance, status: "paid" });
    }
  }
  return {
    interestCovered,
    poolCovered,
    bodyCovered,
    overdueAddedToPool,
    newOverduePool,
    trancheUpdates
  };
}
function getForecastPayments(tranches, overduePool, monthlyPayment, maxMonths = 120) {
  let currentTranches = tranches.map((t) => ({ ...t }));
  let currentPool = overduePool;
  const result = [];
  for (let m = 1; m <= maxMonths; m++) {
    const active = currentTranches.filter((t) => t.status === "active");
    if (active.length === 0 && currentPool === 0) break;
    const res = calculateDadDebtPayment(currentTranches, currentPool, monthlyPayment, 30);
    for (const upd of res.trancheUpdates) {
      const t = currentTranches.find((t2) => t2.id === upd.id);
      if (t) {
        t.currentBalance = upd.newBalance;
        t.status = upd.status;
      }
    }
    currentPool = res.newOverduePool;
    const totalBalance = currentTranches.filter((t) => t.status === "active").reduce((sum, t) => sum + t.currentBalance, 0);
    result.push({
      month: m,
      payment: monthlyPayment,
      interestCovered: res.interestCovered,
      poolCovered: res.poolCovered,
      bodyCovered: res.bodyCovered,
      totalBalance,
      overduePool: currentPool
    });
    if (totalBalance === 0 && currentPool === 0) break;
  }
  return result;
}
const DB_PATH = path.join(electron.app.getPath("userData"), "ucet.db");
let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}
function initSchema() {
  const d = getDb();
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
  `);
  seedDefaultData(d);
}
function seedDefaultData(d) {
  const count = d.prepare("SELECT COUNT(*) as c FROM categories").get().c;
  if (count > 0) return;
  const categoryColors = {
    "Транспорт": "#3B82F6",
    "Еда": "#F97316",
    "Рестораны": "#EC4899",
    "Алкоголь": "#8B5CF6",
    "Подарки": "#EF4444",
    "Продукты": "#22C55E",
    "Сигареты": "#6B7280",
    "Работа": "#0EA5E9",
    "Автомобиль": "#F59E0B",
    "Здоровье": "#10B981",
    "Одежда": "#F472B6",
    "Обучение": "#A855F7",
    "Культ. мероприятия": "#14B8A6",
    "Связь": "#64748B",
    "Прочее": "#94A3B8",
    "Аренда": "#DC2626",
    "ЖКХ": "#B45309",
    "Все для дома": "#D97706"
  };
  const expenseCategories = [
    { name: "Транспорт", subs: ["Такси", "Автобус", "Метро", "Электричка", "Другой транспорт", "Самокат", "Каршеринг"] },
    { name: "Еда", subs: ["Обед (работа)", "Перекус", "Фаст-Фуд", "Сладости", "Доставка"] },
    { name: "Рестораны", subs: ["Бар", "Ресторан", "Доставка", "Кальянная", "Кофе"] },
    { name: "Алкоголь", subs: ["Пиво", "Крепкое", "Закуски"] },
    { name: "Подарки", subs: ["Родственники", "Друзья", "Работа", "Девушка"] },
    { name: "Продукты", subs: [] },
    { name: "Сигареты", subs: [] },
    { name: "Работа", subs: ["Канцелярия", "Проживание", "Почтовые услуги", "Сервисы", "Транспорт", "Налог"] },
    { name: "Автомобиль", subs: ["Бензин", "Парковка", "Мойка", "Ремонт"] },
    { name: "Здоровье", subs: ["Витамины", "Лекарства", "Личная гигиена", "Врачи", "Красота", "Спорт"] },
    { name: "Одежда", subs: [] },
    { name: "Обучение", subs: ["Книги", "Курсы"] },
    { name: "Культ. мероприятия", subs: ["Кино", "Театры", "Музеи", "Спортивные события"] },
    { name: "Связь", subs: ["Телефон", "Интернет"] },
    { name: "Прочее", subs: ["Подписка на сервисы", "Быт. химия"] },
    { name: "Аренда", subs: [] },
    { name: "ЖКХ", subs: ["Основное жильё", "Другая квартира"] },
    { name: "Все для дома", subs: [] }
  ];
  const insertCat = d.prepare("INSERT INTO categories (name, type, color) VALUES (?, ?, ?)");
  const insertSub = d.prepare("INSERT INTO subcategories (category_id, name) VALUES (?, ?)");
  for (const cat of expenseCategories) {
    const res = insertCat.run(cat.name, "expense", categoryColors[cat.name] || "#94A3B8");
    for (const sub of cat.subs) {
      insertSub.run(res.lastInsertRowid, sub);
    }
  }
  const incomeCategories = ["Зарплата", "Подработка", "Аренда (доход)", "Целевые поступления", "Возврат долга", "Прочее"];
  for (const name of incomeCategories) {
    insertCat.run(name, "income", "#22C55E");
  }
  d.prepare("INSERT INTO accounts (name, balance) VALUES (?, ?)").run("Основной счёт", 0);
}
function getOperations(filters) {
  const d = getDb();
  const parts = ["1=1"];
  const params = [];
  if (filters.dateFrom) {
    parts.push("o.date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    parts.push("o.date <= ?");
    params.push(filters.dateTo);
  }
  if (filters.type) {
    parts.push("o.type = ?");
    params.push(filters.type);
  }
  if (filters.categoryId) {
    parts.push("o.category_id = ?");
    params.push(filters.categoryId);
  }
  const sql = `
    SELECT o.*, c.name as category_name, c.color as category_color,
           s.name as subcategory_name
    FROM operations o
    LEFT JOIN categories c ON o.category_id = c.id
    LEFT JOIN subcategories s ON o.subcategory_id = s.id
    WHERE ${parts.join(" AND ")}
    ORDER BY o.date DESC, o.created_at DESC
    ${filters.limit ? `LIMIT ${filters.limit} OFFSET ${filters.offset || 0}` : ""}
  `;
  return d.prepare(sql).all(...params);
}
function addOperation(op) {
  const d = getDb();
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
    debt_id: op.debt_id ?? null
  });
  return r.lastInsertRowid;
}
function importOperations(ops) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
    VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, NULL, @comment, NULL)
  `);
  const insertMany = d.transaction((rows) => {
    for (const op of rows) {
      stmt.run({
        ...op,
        category_id: op.category_id ?? null,
        subcategory_id: op.subcategory_id ?? null,
        expense_type: op.expense_type ?? null,
        comment: op.comment ?? null
      });
    }
    return rows.length;
  });
  return insertMany(ops);
}
function updateOperation(id, op) {
  const d = getDb();
  const fields = Object.entries(op).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  d.prepare(`UPDATE operations SET ${fields} WHERE id = @id`).run({ ...op, id });
}
function deleteOperation(id) {
  getDb().prepare("DELETE FROM operations WHERE id = ?").run(id);
}
function getCategories(type) {
  const d = getDb();
  if (type) return d.prepare("SELECT * FROM categories WHERE type = ? AND archived = 0 ORDER BY name").all(type);
  return d.prepare("SELECT * FROM categories WHERE archived = 0 ORDER BY name").all();
}
function getSubcategories(categoryId) {
  const d = getDb();
  if (categoryId) return d.prepare("SELECT * FROM subcategories WHERE category_id = ? AND archived = 0").all(categoryId);
  return d.prepare("SELECT * FROM subcategories WHERE archived = 0").all();
}
function addCategory(cat) {
  const r = getDb().prepare("INSERT INTO categories (name, type, color, icon) VALUES (@name, @type, @color, @icon)").run(cat);
  return r.lastInsertRowid;
}
function updateCategory(id, data) {
  const fields = Object.entries(data).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  getDb().prepare(`UPDATE categories SET ${fields} WHERE id = @id`).run({ ...data, id });
}
function addSubcategory(sub) {
  const r = getDb().prepare("INSERT INTO subcategories (category_id, name) VALUES (@category_id, @name)").run(sub);
  return r.lastInsertRowid;
}
function updateSubcategory(id, data) {
  const fields = Object.entries(data).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  getDb().prepare(`UPDATE subcategories SET ${fields} WHERE id = @id`).run({ ...data, id });
}
function getDebts(status) {
  const d = getDb();
  if (status) return d.prepare("SELECT * FROM debts WHERE status = ? ORDER BY created_at DESC").all(status);
  return d.prepare("SELECT * FROM debts ORDER BY created_at DESC").all();
}
function getDebt(id) {
  return getDb().prepare("SELECT * FROM debts WHERE id = ?").get(id);
}
function addDebt(debt) {
  const r = getDb().prepare(`
    INSERT INTO debts (name, direction, debt_type, initial_amount, interest_rate, payment_day, monthly_payment)
    VALUES (@name, @direction, @debt_type, @initial_amount, @interest_rate, @payment_day, @monthly_payment)
  `).run(debt);
  return r.lastInsertRowid;
}
function updateDebt(id, data) {
  const fields = Object.entries(data).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  if (!fields) return;
  getDb().prepare(`UPDATE debts SET ${fields} WHERE id = @id`).run({ ...data, id });
}
function deleteDebt(id) {
  const d = getDb();
  d.transaction(() => {
    const paymentIds = d.prepare("SELECT id FROM dad_debt_payments WHERE debt_id = ?").all(id);
    for (const p of paymentIds) {
      d.prepare("DELETE FROM dad_debt_tranche_payments WHERE payment_id = ?").run(p.id);
    }
    d.prepare("DELETE FROM dad_debt_payments WHERE debt_id = ?").run(id);
    d.prepare("DELETE FROM debt_tranches WHERE debt_id = ?").run(id);
    d.prepare("DELETE FROM simple_debt_payments WHERE debt_id = ?").run(id);
    d.prepare("DELETE FROM operations WHERE debt_id = ?").run(id);
    d.prepare("DELETE FROM debts WHERE id = ?").run(id);
  })();
}
function getTranches(debtId) {
  return getDb().prepare("SELECT * FROM debt_tranches WHERE debt_id = ? ORDER BY date ASC").all(debtId);
}
function addTranche(tranche) {
  const r = getDb().prepare(`
    INSERT INTO debt_tranches (debt_id, date, initial_amount, current_balance, interest_rate)
    VALUES (@debt_id, @date, @initial_amount, @initial_amount, @interest_rate)
  `).run(tranche);
  return r.lastInsertRowid;
}
function processDadPayment(debtId, paymentAmount, paymentDate, daysSince) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const tranchesRaw = d.prepare("SELECT * FROM debt_tranches WHERE debt_id = ?").all(debtId);
  const tranches = tranchesRaw.map((t) => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status
  }));
  const result = calculateDadDebtPayment(tranches, debt.overdue_interest_pool, paymentAmount, daysSince);
  const processPayment = d.transaction(() => {
    const paymentId = d.prepare(`
      INSERT INTO dad_debt_payments (debt_id, payment_date, total_amount, interest_covered, pool_covered, body_covered, overdue_added_to_pool)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(debtId, paymentDate, paymentAmount, result.interestCovered, result.poolCovered, result.bodyCovered, result.overdueAddedToPool).lastInsertRowid;
    for (const upd of result.trancheUpdates) {
      const prev = tranches.find((t) => t.id === upd.id);
      const applied = prev ? prev.currentBalance - upd.newBalance : 0;
      if (applied > 0) {
        d.prepare("INSERT INTO dad_debt_tranche_payments (payment_id, tranche_id, amount_applied) VALUES (?, ?, ?)").run(paymentId, upd.id, applied);
      }
      d.prepare("UPDATE debt_tranches SET current_balance = ?, status = ? WHERE id = ?").run(upd.newBalance, upd.status, upd.id);
    }
    d.prepare("UPDATE debts SET overdue_interest_pool = ? WHERE id = ?").run(result.newOverduePool, debtId);
    return paymentId;
  });
  processPayment();
  return result;
}
function getDadPaymentHistory(debtId) {
  const d = getDb();
  const payments = d.prepare("SELECT * FROM dad_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC").all(debtId);
  return payments.map((p) => {
    const trancheBreakdown = d.prepare(`
      SELECT dtp.*, dt.interest_rate, dt.date as tranche_date
      FROM dad_debt_tranche_payments dtp
      JOIN debt_tranches dt ON dtp.tranche_id = dt.id
      WHERE dtp.payment_id = ?
    `).all(p.id);
    return { ...p, trancheBreakdown };
  });
}
function getSimpleDebtPayments(debtId) {
  return getDb().prepare("SELECT * FROM simple_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC").all(debtId);
}
function processSimplePayment(debtId, amount, paymentDate, interestPart = 0) {
  const d = getDb();
  const bodyPart = amount - interestPart;
  d.prepare("INSERT INTO simple_debt_payments (debt_id, payment_date, total_amount, interest_part, body_part) VALUES (?, ?, ?, ?, ?)").run(debtId, paymentDate, amount, interestPart, bodyPart);
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const paid = d.prepare("SELECT SUM(body_part) as total FROM simple_debt_payments WHERE debt_id = ?").get(debtId).total || 0;
  if (paid >= debt.initial_amount) {
    d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(debtId);
  }
}
function getDadForecast(debtId, monthlyPayment) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const tranchesRaw = d.prepare("SELECT * FROM debt_tranches WHERE debt_id = ?").all(debtId);
  const tranches = tranchesRaw.map((t) => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status
  }));
  return getForecastPayments(tranches, debt.overdue_interest_pool, monthlyPayment);
}
function getSimpleForecast(debtId, monthlyPayment) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const paid = d.prepare("SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?").get(debtId).total;
  let balance = Math.max(0, (debt.initial_amount || 0) - paid);
  const rate = debt.interest_rate || 0;
  const result = [];
  for (let m = 1; m <= 360 && balance > 0; m++) {
    const interest = balance * rate * (30 / 365);
    const bodyPayment = Math.min(balance, Math.max(0, monthlyPayment - interest));
    const actualInterest = Math.min(interest, monthlyPayment);
    balance -= bodyPayment;
    result.push({
      month: m,
      payment: monthlyPayment,
      interestCovered: actualInterest,
      poolCovered: 0,
      bodyCovered: bodyPayment,
      totalBalance: Math.max(0, balance),
      overduePool: 0
    });
    if (balance <= 0) break;
  }
  return result;
}
function getSummary(dateFrom, dateTo) {
  const d = getDb();
  const income = d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const expense = d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 864e5) + 1);
  return { income, expense, balance: income - expense, avgPerDay: expense / days };
}
function getExpensesByCategory(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT c.id, c.name, c.color, SUM(o.amount) as total
    FROM operations o
    JOIN categories c ON o.category_id = c.id
    WHERE o.type = 'expense' AND o.date >= ? AND o.date <= ?
    GROUP BY c.id ORDER BY total DESC
  `).all(dateFrom, dateTo);
}
function getDailyExpenses(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT date, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses,
           SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income
    FROM operations WHERE date >= ? AND date <= ?
    GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo);
}
function getExpensesByType(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT expense_type, SUM(amount) as total
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY expense_type
  `).all(dateFrom, dateTo);
}
function getMonthlyExpenses(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY month ORDER BY month ASC
  `).all(dateFrom, dateTo);
}
function getExpensesByDayOfWeek(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) as dow, SUM(amount) as total, COUNT(*) as count
    FROM operations WHERE type='expense' AND date >= ? AND date <= ?
    GROUP BY dow ORDER BY dow ASC
  `).all(dateFrom, dateTo);
}
function getBudgetSettings() {
  const rows = getDb().prepare("SELECT key, value FROM budget_settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
function setBudgetSetting(key, value) {
  getDb().prepare("INSERT OR REPLACE INTO budget_settings (key, value) VALUES (?, ?)").run(key, value);
}
function getCashFlow(year, month) {
  const d = getDb();
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const income = d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const mandatory = d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense' AND expense_type='apartment' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const dailyBudget = (income - mandatory) / lastDay;
  const dailyRows = d.prepare(`
    SELECT date, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as day_expenses
    FROM operations WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo);
  let cumExpenses = 0;
  let cumLimit = 0;
  const journal = dailyRows.map((row) => {
    cumExpenses += row.day_expenses;
    const dayNum = parseInt(row.date.split("-")[2]);
    cumLimit = dailyBudget * dayNum;
    return {
      date: row.date,
      dayExpenses: row.day_expenses,
      cumLimit: Math.round(cumLimit * 100) / 100,
      saldo: Math.round((cumLimit - cumExpenses) * 100) / 100
    };
  });
  return { income, mandatory, dailyBudget, journal, dateFrom, dateTo };
}
function exportDb(targetPath) {
  const d = getDb();
  d.backup(targetPath);
}
function importDb(sourcePath) {
  if (db) {
    db.close();
    db = null;
  }
  fs.copyFileSync(sourcePath, DB_PATH);
  getDb();
}
function getDbPath() {
  return DB_PATH;
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.ucet.app");
  electron.app.on("browser-window-created", (_, w) => optimizer.watchWindowShortcuts(w));
  electron.ipcMain.handle("get-operations", (_, filters) => getOperations(filters));
  electron.ipcMain.handle("add-operation", (_, op) => addOperation(op));
  electron.ipcMain.handle("import-operations", (_, ops) => importOperations(ops));
  electron.ipcMain.handle("update-operation", (_, id, op) => updateOperation(id, op));
  electron.ipcMain.handle("delete-operation", (_, id) => deleteOperation(id));
  electron.ipcMain.handle("get-categories", (_, type) => getCategories(type));
  electron.ipcMain.handle("get-subcategories", (_, catId) => getSubcategories(catId));
  electron.ipcMain.handle("add-category", (_, cat) => addCategory(cat));
  electron.ipcMain.handle("update-category", (_, id, data) => updateCategory(id, data));
  electron.ipcMain.handle("add-subcategory", (_, sub) => addSubcategory(sub));
  electron.ipcMain.handle("update-subcategory", (_, id, data) => updateSubcategory(id, data));
  electron.ipcMain.handle("get-debts", (_, status) => getDebts(status));
  electron.ipcMain.handle("get-debt", (_, id) => getDebt(id));
  electron.ipcMain.handle("add-debt", (_, debt) => addDebt(debt));
  electron.ipcMain.handle("update-debt", (_, id, data) => updateDebt(id, data));
  electron.ipcMain.handle("delete-debt", (_, id) => deleteDebt(id));
  electron.ipcMain.handle("get-tranches", (_, debtId) => getTranches(debtId));
  electron.ipcMain.handle("add-tranche", (_, tranche) => addTranche(tranche));
  electron.ipcMain.handle("process-dad-payment", (_, debtId, amount, date, days) => processDadPayment(debtId, amount, date, days));
  electron.ipcMain.handle("get-dad-payment-history", (_, debtId) => getDadPaymentHistory(debtId));
  electron.ipcMain.handle("get-simple-debt-payments", (_, debtId) => getSimpleDebtPayments(debtId));
  electron.ipcMain.handle("process-simple-payment", (_, debtId, amount, date, interestPart) => processSimplePayment(debtId, amount, date, interestPart));
  electron.ipcMain.handle("get-dad-forecast", (_, debtId, payment) => getDadForecast(debtId, payment));
  electron.ipcMain.handle("get-simple-forecast", (_, debtId, payment) => getSimpleForecast(debtId, payment));
  electron.ipcMain.handle("get-summary", (_, dateFrom, dateTo) => getSummary(dateFrom, dateTo));
  electron.ipcMain.handle("get-expenses-by-category", (_, dateFrom, dateTo) => getExpensesByCategory(dateFrom, dateTo));
  electron.ipcMain.handle("get-daily-expenses", (_, dateFrom, dateTo) => getDailyExpenses(dateFrom, dateTo));
  electron.ipcMain.handle("get-expenses-by-type", (_, dateFrom, dateTo) => getExpensesByType(dateFrom, dateTo));
  electron.ipcMain.handle("get-monthly-expenses", (_, dateFrom, dateTo) => getMonthlyExpenses(dateFrom, dateTo));
  electron.ipcMain.handle("get-expenses-by-day-of-week", (_, dateFrom, dateTo) => getExpensesByDayOfWeek(dateFrom, dateTo));
  electron.ipcMain.handle("get-budget-settings", () => getBudgetSettings());
  electron.ipcMain.handle("set-budget-setting", (_, key, value) => setBudgetSetting(key, value));
  electron.ipcMain.handle("get-cash-flow", (_, year, month) => getCashFlow(year, month));
  electron.ipcMain.handle("export-db", async () => {
    const result = await electron.dialog.showSaveDialog({
      defaultPath: `ucet-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.db`,
      filters: [{ name: "SQLite Database", extensions: ["db"] }]
    });
    if (!result.canceled && result.filePath) {
      exportDb(result.filePath);
      return result.filePath;
    }
    return null;
  });
  electron.ipcMain.handle("import-db", async () => {
    const result = await electron.dialog.showOpenDialog({
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
      properties: ["openFile"]
    });
    if (!result.canceled && result.filePaths[0]) {
      importDb(result.filePaths[0]);
      return true;
    }
    return false;
  });
  electron.ipcMain.handle("export-json", async (_, data) => {
    const result = await electron.dialog.showSaveDialog({
      defaultPath: `ucet-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), "utf-8");
      return result.filePath;
    }
    return null;
  });
  electron.ipcMain.handle("get-db-path", () => getDbPath());
  electron.ipcMain.handle("open-import-file", async () => {
    const result = await electron.dialog.showOpenDialog({
      filters: [
        { name: "Таблицы (Excel, CSV)", extensions: ["xlsx", "xls", "csv"] }
      ],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    try {
      if (ext === ".csv") {
        const text = fs.readFileSync(filePath, "utf-8");
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) return { error: "Файл пустой" };
        const sep = lines[0].includes(";") ? ";" : ",";
        const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
        return { headers: rows[0], rows: rows.slice(1) };
      } else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filePath);
        const ws = wb.worksheets[0];
        if (!ws) return { error: "Нет листов в файле" };
        const rows = [];
        ws.eachRow((row) => {
          rows.push(row.values.slice(1).map((v) => v == null ? "" : String(v)));
        });
        if (rows.length === 0) return { error: "Файл пустой" };
        return { headers: rows[0], rows: rows.slice(1) };
      }
    } catch (e) {
      return { error: String(e) };
    }
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
