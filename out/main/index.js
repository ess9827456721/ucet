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
const DEFAULT_SETTINGS = { tranchePayoffOrder: "highest_rate", poolRatio: 0.5 };
function calculateDadDebtPayment(tranches, overduePool, paymentAmount, daysSinceLastPayment, settings = DEFAULT_SETTINGS) {
  const activeTranches = tranches.filter((t) => t.status === "active");
  const trancheInterests = activeTranches.map((t) => ({
    tranche: t,
    interest: t.currentBalance * t.interestRate * ((t.daysSinceInterestStart ?? daysSinceLastPayment) / 365)
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
      const poolAllocation = Math.min(remainder * settings.poolRatio, overduePool);
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
  const trancheUpdates = [];
  let remainingBody = bodyCovered;
  if (settings.tranchePayoffOrder === "proportional") {
    const totalActiveBalance = activeTranches.reduce((s, t) => s + t.currentBalance, 0);
    let distributed = 0;
    activeTranches.forEach((t, i) => {
      const isLast = i === activeTranches.length - 1;
      const share = isLast ? bodyCovered - distributed : totalActiveBalance > 0 ? bodyCovered * (t.currentBalance / totalActiveBalance) : 0;
      distributed += share;
      const newBal = Math.max(0, t.currentBalance - share);
      trancheUpdates.push({ id: t.id, newBalance: newBal, status: newBal <= 0 ? "paid" : "active" });
    });
    remainingBody = 0;
  } else {
    let sortedTranches;
    if (settings.tranchePayoffOrder === "smallest_balance") {
      sortedTranches = [...activeTranches].sort((a, b) => a.currentBalance - b.currentBalance);
    } else if (settings.tranchePayoffOrder === "earliest_first") {
      sortedTranches = [...activeTranches].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    } else {
      sortedTranches = [...activeTranches].sort((a, b) => b.interestRate - a.interestRate);
    }
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
    overpayment: Math.max(0, remainingBody),
    trancheUpdates
  };
}
function getForecastPayments(tranches, overduePool, monthlyPayment, maxMonths = 120, settings = DEFAULT_SETTINGS) {
  let currentTranches = tranches.map((t) => ({ ...t }));
  let currentPool = overduePool;
  const result = [];
  for (let m = 1; m <= maxMonths; m++) {
    const active = currentTranches.filter((t) => t.status === "active");
    if (active.length === 0 && currentPool === 0) break;
    const res = calculateDadDebtPayment(currentTranches, currentPool, monthlyPayment, 30, settings);
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
  `);
  seedDefaultData(d);
  const dadCols = d.prepare("PRAGMA table_info(dad_debt_payments)").all().map((c) => c.name);
  if (!dadCols.includes("operation_id")) {
    d.exec("ALTER TABLE dad_debt_payments ADD COLUMN operation_id INTEGER");
  }
  if (!dadCols.includes("marked_sufficient")) {
    d.exec("ALTER TABLE dad_debt_payments ADD COLUMN marked_sufficient INTEGER DEFAULT 0");
  }
  const simpleCols = d.prepare("PRAGMA table_info(simple_debt_payments)").all().map((c) => c.name);
  if (!simpleCols.includes("operation_id")) {
    d.exec("ALTER TABLE simple_debt_payments ADD COLUMN operation_id INTEGER");
  }
  const debtCols = d.prepare("PRAGMA table_info(debts)").all().map((c) => c.name);
  if (!debtCols.includes("category")) d.exec("ALTER TABLE debts ADD COLUMN category TEXT");
  if (!debtCols.includes("sort_order")) d.exec("ALTER TABLE debts ADD COLUMN sort_order INTEGER DEFAULT 0");
  if (!debtCols.includes("is_hidden")) d.exec("ALTER TABLE debts ADD COLUMN is_hidden INTEGER DEFAULT 0");
  const opCols = d.prepare("PRAGMA table_info(operations)").all().map((c) => c.name);
  if (!opCols.includes("goal_id")) d.exec("ALTER TABLE operations ADD COLUMN goal_id INTEGER REFERENCES savings_goals(id)");
  if (!debtCols.includes("loan_date")) d.exec("ALTER TABLE debts ADD COLUMN loan_date TEXT");
  if (!debtCols.includes("tranche_payoff_order")) d.exec("ALTER TABLE debts ADD COLUMN tranche_payoff_order TEXT DEFAULT 'highest_rate'");
  if (!debtCols.includes("pool_ratio")) d.exec("ALTER TABLE debts ADD COLUMN pool_ratio REAL DEFAULT 0.5");
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
  if (filters.noCategory) {
    parts.push("o.category_id IS NULL AND o.type = 'expense'");
  } else if (filters.noSubcategory) {
    parts.push("o.subcategory_id IS NULL");
  } else if (filters.categoryId) {
    parts.push("o.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.subcategoryId) {
    parts.push("o.subcategory_id = ?");
    params.push(filters.subcategoryId);
  }
  if (filters.commentSearch) {
    parts.push("o.comment LIKE ?");
    params.push(`%${filters.commentSearch}%`);
  }
  if (filters.amountFrom != null) {
    parts.push("o.amount >= ?");
    params.push(filters.amountFrom);
  }
  if (filters.debtId != null) {
    parts.push("o.debt_id = ?");
    params.push(filters.debtId);
  }
  if (filters.amountTo != null) {
    parts.push("o.amount <= ?");
    params.push(filters.amountTo);
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
      goal_id: op.goal_id ?? null
    });
    if (op.goal_id) {
      d.prepare("UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?").run(op.amount, op.goal_id);
    }
    return r.lastInsertRowid;
  })();
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
  const d = getDb();
  d.transaction(() => {
    const op = d.prepare("SELECT goal_id, amount FROM operations WHERE id = ?").get(id);
    if (op?.goal_id) {
      d.prepare("UPDATE savings_goals SET current_amount = MAX(0, current_amount - ?) WHERE id = ?").run(op.amount, op.goal_id);
    }
    d.prepare("DELETE FROM operations WHERE id = ?").run(id);
  })();
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
  if (status) return d.prepare("SELECT * FROM debts WHERE status = ? ORDER BY COALESCE(sort_order, 9999), id ASC").all(status);
  return d.prepare("SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC").all();
}
function getDebt(id) {
  return getDb().prepare("SELECT * FROM debts WHERE id = ?").get(id);
}
function addDebt(debt) {
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
    loan_date: debt.loan_date ?? null
  });
  return r.lastInsertRowid;
}
function updateDebtsOrder(orderedIds) {
  const d = getDb();
  const upd = d.prepare("UPDATE debts SET sort_order = ? WHERE id = ?");
  d.transaction(() => {
    orderedIds.forEach((id, i) => upd.run(i, id));
  })();
}
function getDebtsWithBalance() {
  const d = getDb();
  const debts = d.prepare("SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC").all();
  return debts.map((debt) => {
    let currentBalance;
    if (debt.debt_type === "dad") {
      const row = d.prepare(
        "SELECT COALESCE(SUM(current_balance),0) as bal FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).get(debt.id);
      currentBalance = row.bal;
    } else {
      const row = d.prepare(
        "SELECT COALESCE(SUM(body_part),0) as paid FROM simple_debt_payments WHERE debt_id = ?"
      ).get(debt.id);
      currentBalance = Math.max(0, (debt.initial_amount || 0) - row.paid);
    }
    return { ...debt, current_balance: currentBalance };
  });
}
function getDebtsWithDetails() {
  const d = getDb();
  const debts = d.prepare("SELECT * FROM debts ORDER BY COALESCE(sort_order, 9999), id ASC").all();
  const today = /* @__PURE__ */ new Date();
  return debts.map((debt) => {
    let currentBalance;
    let accruedInterest;
    let lastPaymentDateStr;
    if (debt.debt_type === "dad") {
      const row = d.prepare(
        "SELECT COALESCE(SUM(current_balance),0) as bal FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).get(debt.id);
      currentBalance = row.bal;
      const lastPay = d.prepare(
        "SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?"
      ).get(debt.id);
      lastPaymentDateStr = lastPay.dt;
      const tranches = d.prepare(
        "SELECT current_balance, interest_rate, date FROM debt_tranches WHERE debt_id = ? AND status = 'active'"
      ).all(debt.id);
      if (lastPay.dt) {
        const lastPaymentDate = /* @__PURE__ */ new Date(lastPay.dt + "T00:00:00");
        const days = Math.max(0, Math.round((today.getTime() - lastPaymentDate.getTime()) / 864e5));
        const trancheInterest = tranches.reduce((s, t) => s + t.current_balance * t.interest_rate * (days / 365), 0);
        accruedInterest = trancheInterest;
      } else {
        const trancheInterest = tranches.reduce((s, t) => {
          const tDate = /* @__PURE__ */ new Date(t.date + "T00:00:00");
          const days = Math.max(0, Math.round((today.getTime() - tDate.getTime()) / 864e5));
          return s + t.current_balance * t.interest_rate * (days / 365);
        }, 0);
        accruedInterest = trancheInterest;
      }
    } else {
      const row = d.prepare(
        "SELECT COALESCE(SUM(body_part),0) as paid FROM simple_debt_payments WHERE debt_id = ?"
      ).get(debt.id);
      currentBalance = Math.max(0, (debt.initial_amount || 0) - row.paid);
      const lastPay = d.prepare(
        "SELECT MAX(payment_date) as dt FROM simple_debt_payments WHERE debt_id = ?"
      ).get(debt.id);
      lastPaymentDateStr = lastPay.dt;
      const interestStartStr = lastPay.dt ?? debt.loan_date ?? debt.created_at;
      const lastPaymentDate = /* @__PURE__ */ new Date(interestStartStr + (interestStartStr.includes("T") ? "" : "T00:00:00"));
      const days = Math.max(0, Math.round((today.getTime() - lastPaymentDate.getTime()) / 864e5));
      accruedInterest = debt.interest_rate ? currentBalance * debt.interest_rate * (days / 365) : 0;
    }
    let isOverdue = false;
    const payDay = debt.payment_day;
    const debtStatus = debt.status;
    if (payDay && debtStatus === "active") {
      const currentMonthPayDate = new Date(today.getFullYear(), today.getMonth(), payDay);
      if (today > currentMonthPayDate) {
        const prevYear = currentMonthPayDate.getMonth() === 0 ? currentMonthPayDate.getFullYear() - 1 : currentMonthPayDate.getFullYear();
        const prevMonth = currentMonthPayDate.getMonth() === 0 ? 11 : currentMonthPayDate.getMonth() - 1;
        const periodStart = new Date(prevYear, prevMonth, payDay);
        const fmtDate = (dt) => dt.toISOString().slice(0, 10);
        const startStr = fmtDate(periodStart);
        const endStr = fmtDate(currentMonthPayDate);
        if (debt.debt_type === "simple") {
          const paid = d.prepare(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM simple_debt_payments WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ?"
          ).get(debt.id, startStr, endStr).total;
          isOverdue = paid < (debt.monthly_payment ?? 0);
        } else {
          const sufficient = d.prepare(
            "SELECT COUNT(*) as c FROM dad_debt_payments WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ? AND total_amount > 0 AND (overdue_added_to_pool = 0 OR marked_sufficient = 1)"
          ).get(debt.id, startStr, endStr).c;
          isOverdue = sufficient === 0;
        }
      }
    }
    return { ...debt, current_balance: currentBalance, accrued_interest: accruedInterest, last_payment_date: lastPaymentDateStr, is_overdue: isOverdue };
  });
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
function updateTranche(trancheId, data) {
  const d = getDb();
  const t = d.prepare("SELECT * FROM debt_tranches WHERE id = ?").get(trancheId);
  if (!t) return { ok: false, reason: "not_found" };
  const isPartiallyPaid = t.current_balance < t.initial_amount - 0.01;
  const updateData = {};
  if (data.date !== void 0) updateData.date = data.date;
  if (data.interest_rate !== void 0) updateData.interest_rate = data.interest_rate;
  if (data.initial_amount !== void 0 && !isPartiallyPaid) {
    updateData.initial_amount = data.initial_amount;
    updateData.current_balance = data.initial_amount;
  }
  const fields = Object.keys(updateData).map((k) => `${k} = @${k}`).join(", ");
  if (!fields) return { ok: true };
  d.prepare(`UPDATE debt_tranches SET ${fields} WHERE id = @id`).run({ ...updateData, id: trancheId });
  return { ok: true };
}
function deleteTranche(trancheId) {
  const d = getDb();
  const t = d.prepare("SELECT * FROM debt_tranches WHERE id = ?").get(trancheId);
  if (!t) return { ok: false, reason: "not_found" };
  if (t.current_balance < t.initial_amount - 0.01) return { ok: false, reason: "partially_paid" };
  d.prepare("DELETE FROM debt_tranches WHERE id = ?").run(trancheId);
  return { ok: true };
}
function getDaysSinceLastPayment(debtId, asOfDate) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  let since;
  if (debt.debt_type === "dad") {
    const row = d.prepare("SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?").get(debtId);
    if (row.dt) {
      since = row.dt;
    } else {
      const earliest = d.prepare("SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?").get(debtId);
      since = earliest.dt ?? debt.created_at.slice(0, 10);
    }
  } else {
    const row = d.prepare("SELECT MAX(payment_date) as dt FROM simple_debt_payments WHERE debt_id = ?").get(debtId);
    since = row.dt ?? debt.created_at.slice(0, 10);
  }
  const lastDate = /* @__PURE__ */ new Date(since + "T00:00:00");
  const asOf = /* @__PURE__ */ new Date(asOfDate + "T00:00:00");
  const days = Math.max(0, Math.round((asOf.getTime() - lastDate.getTime()) / 864e5));
  return { days, since };
}
function getDebtSettings(debt) {
  return {
    tranchePayoffOrder: debt.tranche_payoff_order ?? "highest_rate",
    poolRatio: debt.pool_ratio ?? 0.5
  };
}
function processDadPayment(debtId, paymentAmount, paymentDate) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const lastPayRow = d.prepare("SELECT MAX(payment_date) as dt FROM dad_debt_payments WHERE debt_id = ?").get(debtId);
  let lastPayDate;
  if (lastPayRow.dt) {
    lastPayDate = /* @__PURE__ */ new Date(lastPayRow.dt + "T00:00:00");
  } else {
    const earliestTranche = d.prepare("SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?").get(debtId);
    lastPayDate = /* @__PURE__ */ new Date((earliestTranche.dt ?? debt.created_at.slice(0, 10)) + "T00:00:00");
  }
  const payDateObj = /* @__PURE__ */ new Date(paymentDate + "T00:00:00");
  const tranchesRaw = d.prepare("SELECT * FROM debt_tranches WHERE debt_id = ?").all(debtId);
  const tranches = tranchesRaw.map((t) => {
    const trancheDate = /* @__PURE__ */ new Date(t.date + "T00:00:00");
    const interestStart = trancheDate > lastPayDate ? trancheDate : lastPayDate;
    const daysSince = Math.max(0, Math.round((payDateObj.getTime() - interestStart.getTime()) / 864e5));
    return {
      id: t.id,
      currentBalance: t.current_balance,
      interestRate: t.interest_rate,
      status: t.status,
      daysSinceInterestStart: daysSince,
      date: t.date
    };
  });
  const result = calculateDadDebtPayment(tranches, debt.overdue_interest_pool, paymentAmount, 0, getDebtSettings(debt));
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
    const opId = d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, paymentAmount, `Платёж по долгу: ${debt.name}`, debtId).lastInsertRowid;
    d.prepare("UPDATE dad_debt_payments SET operation_id = ? WHERE id = ?").run(opId, paymentId);
    return paymentId;
  });
  const newPaymentId = processPayment();
  return { ...result, paymentId: newPaymentId };
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
function markDadPaymentSufficient(paymentId) {
  getDb().prepare("UPDATE dad_debt_payments SET marked_sufficient = 1 WHERE id = ?").run(paymentId);
}
function getSimpleDebtPayments(debtId) {
  return getDb().prepare("SELECT * FROM simple_debt_payments WHERE debt_id = ? ORDER BY payment_date DESC").all(debtId);
}
function processSimplePayment(debtId, amount, paymentDate, interestPart = 0) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  d.transaction(() => {
    const bodyPart = amount - interestPart;
    const paymentId = d.prepare("INSERT INTO simple_debt_payments (debt_id, payment_date, total_amount, interest_part, body_part) VALUES (?, ?, ?, ?, ?)").run(debtId, paymentDate, amount, interestPart, bodyPart).lastInsertRowid;
    const paid = d.prepare("SELECT SUM(body_part) as total FROM simple_debt_payments WHERE debt_id = ?").get(debtId).total || 0;
    if (paid >= debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(debtId);
    }
    const opId = d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (?, 'debt_op', ?, NULL, NULL, NULL, NULL, ?, ?)
    `).run(paymentDate, amount, `Платёж по долгу: ${debt.name}`, debtId).lastInsertRowid;
    d.prepare("UPDATE simple_debt_payments SET operation_id = ? WHERE id = ?").run(opId, paymentId);
  })();
}
function replayDadPayments(d, debtId) {
  d.prepare("UPDATE debt_tranches SET current_balance = initial_amount, status = 'active' WHERE debt_id = ?").run(debtId);
  d.prepare("UPDATE debts SET overdue_interest_pool = 0 WHERE id = ?").run(debtId);
  d.prepare("DELETE FROM dad_debt_tranche_payments WHERE payment_id IN (SELECT id FROM dad_debt_payments WHERE debt_id = ?)").run(debtId);
  const debtRow = d.prepare("SELECT tranche_payoff_order, pool_ratio FROM debts WHERE id = ?").get(debtId);
  const settings = getDebtSettings(debtRow);
  const payments = d.prepare("SELECT * FROM dad_debt_payments WHERE debt_id = ? ORDER BY payment_date ASC, id ASC").all(debtId);
  const earliestTranche = d.prepare("SELECT MIN(date) as dt FROM debt_tranches WHERE debt_id = ?").get(debtId);
  let currentPool = 0;
  for (let i = 0; i < payments.length; i++) {
    const pay = payments[i];
    const payDateObj = /* @__PURE__ */ new Date(pay.payment_date + "T00:00:00");
    const lastPayDate = i === 0 ? /* @__PURE__ */ new Date((earliestTranche.dt ?? pay.payment_date) + "T00:00:00") : /* @__PURE__ */ new Date(payments[i - 1].payment_date + "T00:00:00");
    const tranchesRaw = d.prepare("SELECT * FROM debt_tranches WHERE debt_id = ?").all(debtId);
    const tranches = tranchesRaw.map((t) => {
      const trancheDate = /* @__PURE__ */ new Date(t.date + "T00:00:00");
      const interestStart = trancheDate > lastPayDate ? trancheDate : lastPayDate;
      const daysSince = Math.max(0, Math.round((payDateObj.getTime() - interestStart.getTime()) / 864e5));
      return { id: t.id, currentBalance: t.current_balance, interestRate: t.interest_rate, status: t.status, daysSinceInterestStart: daysSince, date: t.date };
    });
    const result = calculateDadDebtPayment(tranches, currentPool, pay.total_amount, 0, settings);
    d.prepare("UPDATE dad_debt_payments SET interest_covered = ?, pool_covered = ?, body_covered = ?, overdue_added_to_pool = ? WHERE id = ?").run(result.interestCovered, result.poolCovered, result.bodyCovered, result.overdueAddedToPool, pay.id);
    for (const upd of result.trancheUpdates) {
      const prev = tranches.find((t) => t.id === upd.id);
      const applied = prev ? prev.currentBalance - upd.newBalance : 0;
      if (applied > 0) {
        d.prepare("INSERT INTO dad_debt_tranche_payments (payment_id, tranche_id, amount_applied) VALUES (?, ?, ?)").run(pay.id, upd.id, applied);
      }
      d.prepare("UPDATE debt_tranches SET current_balance = ?, status = ? WHERE id = ?").run(upd.newBalance, upd.status, upd.id);
    }
    currentPool = result.newOverduePool;
  }
  d.prepare("UPDATE debts SET overdue_interest_pool = ? WHERE id = ?").run(currentPool, debtId);
}
function deleteDadPayment(paymentId) {
  const d = getDb();
  d.transaction(() => {
    const payment = d.prepare("SELECT * FROM dad_debt_payments WHERE id = ?").get(paymentId);
    if (payment.operation_id) {
      d.prepare("DELETE FROM operations WHERE id = ?").run(payment.operation_id);
    } else {
      d.prepare("DELETE FROM operations WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1").run(payment.debt_id, payment.payment_date, payment.total_amount);
    }
    d.prepare("DELETE FROM dad_debt_tranche_payments WHERE payment_id = ?").run(paymentId);
    d.prepare("DELETE FROM dad_debt_payments WHERE id = ?").run(paymentId);
    replayDadPayments(d, payment.debt_id);
  })();
}
function updateDadPayment(paymentId, newDate, newAmount) {
  const d = getDb();
  d.transaction(() => {
    const payment = d.prepare("SELECT * FROM dad_debt_payments WHERE id = ?").get(paymentId);
    d.prepare("UPDATE dad_debt_payments SET payment_date = ?, total_amount = ? WHERE id = ?").run(newDate, newAmount, paymentId);
    if (payment.operation_id) {
      d.prepare("UPDATE operations SET date = ?, amount = ? WHERE id = ?").run(newDate, newAmount, payment.operation_id);
    } else {
      d.prepare("UPDATE operations SET date = ?, amount = ? WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1").run(newDate, newAmount, payment.debt_id, payment.payment_date, payment.total_amount);
    }
    replayDadPayments(d, payment.debt_id);
  })();
}
function deleteSimpleDebtPayment(paymentId) {
  const d = getDb();
  d.transaction(() => {
    const payment = d.prepare("SELECT * FROM simple_debt_payments WHERE id = ?").get(paymentId);
    const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(payment.debt_id);
    if (payment.operation_id) {
      d.prepare("DELETE FROM operations WHERE id = ?").run(payment.operation_id);
    } else {
      d.prepare("DELETE FROM operations WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1").run(payment.debt_id, payment.payment_date, payment.total_amount);
    }
    d.prepare("DELETE FROM simple_debt_payments WHERE id = ?").run(paymentId);
    const paid = d.prepare("SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?").get(payment.debt_id).total;
    if (paid < debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'active' WHERE id = ?").run(payment.debt_id);
    }
  })();
}
function updateSimpleDebtPayment(paymentId, newAmount, newDate, newInterestPart) {
  const d = getDb();
  d.transaction(() => {
    const payment = d.prepare("SELECT * FROM simple_debt_payments WHERE id = ?").get(paymentId);
    const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(payment.debt_id);
    const newBodyPart = newAmount - newInterestPart;
    d.prepare("UPDATE simple_debt_payments SET total_amount = ?, payment_date = ?, interest_part = ?, body_part = ? WHERE id = ?").run(newAmount, newDate, newInterestPart, newBodyPart, paymentId);
    if (payment.operation_id) {
      d.prepare("UPDATE operations SET amount = ?, date = ? WHERE id = ?").run(newAmount, newDate, payment.operation_id);
    } else {
      d.prepare("UPDATE operations SET amount = ?, date = ? WHERE debt_id = ? AND type = 'debt_op' AND date = ? AND amount = ? LIMIT 1").run(newAmount, newDate, payment.debt_id, payment.payment_date, payment.total_amount);
    }
    const paid = d.prepare("SELECT COALESCE(SUM(body_part),0) as total FROM simple_debt_payments WHERE debt_id = ?").get(payment.debt_id).total;
    if (paid >= debt.initial_amount) {
      d.prepare("UPDATE debts SET status = 'closed' WHERE id = ?").run(payment.debt_id);
    } else {
      d.prepare("UPDATE debts SET status = 'active' WHERE id = ?").run(payment.debt_id);
    }
  })();
}
function hasDadPaymentsAfter(paymentId) {
  const d = getDb();
  const payment = d.prepare("SELECT * FROM dad_debt_payments WHERE id = ?").get(paymentId);
  const count = d.prepare("SELECT COUNT(*) as c FROM dad_debt_payments WHERE debt_id = ? AND payment_date > ?").get(payment.debt_id, payment.payment_date).c;
  return count > 0;
}
function hasSimplePaymentsAfter(paymentId) {
  const d = getDb();
  const payment = d.prepare("SELECT * FROM simple_debt_payments WHERE id = ?").get(paymentId);
  const count = d.prepare("SELECT COUNT(*) as c FROM simple_debt_payments WHERE debt_id = ? AND payment_date > ?").get(payment.debt_id, payment.payment_date).c;
  return count > 0;
}
function getDadForecast(debtId, monthlyPayment) {
  const d = getDb();
  const debt = d.prepare("SELECT * FROM debts WHERE id = ?").get(debtId);
  const tranchesRaw = d.prepare("SELECT * FROM debt_tranches WHERE debt_id = ?").all(debtId);
  const tranches = tranchesRaw.map((t) => ({
    id: t.id,
    currentBalance: t.current_balance,
    interestRate: t.interest_rate,
    status: t.status,
    date: t.date
  }));
  return getForecastPayments(tranches, debt.overdue_interest_pool, monthlyPayment, 120, getDebtSettings(debt));
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
function getRecurringOperations(activeOnly = false) {
  if (activeOnly) return getDb().prepare("SELECT * FROM recurring_operations WHERE active = 1 ORDER BY day_of_month ASC").all();
  return getDb().prepare("SELECT * FROM recurring_operations ORDER BY day_of_month ASC").all();
}
function addRecurringOperation(r) {
  const res = getDb().prepare(`
    INSERT INTO recurring_operations (type, amount, category_id, subcategory_id, expense_type, day_of_month, comment)
    VALUES (@type, @amount, @category_id, @subcategory_id, @expense_type, @day_of_month, @comment)
  `).run({
    ...r,
    category_id: r.category_id ?? null,
    subcategory_id: r.subcategory_id ?? null,
    expense_type: r.expense_type ?? null,
    comment: r.comment ?? null
  });
  return res.lastInsertRowid;
}
function updateRecurringOperation(id, data) {
  const fields = Object.entries(data).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  if (!fields) return;
  getDb().prepare(`UPDATE recurring_operations SET ${fields} WHERE id = @id`).run({ ...data, id });
}
function deleteRecurringOperation(id) {
  getDb().prepare("DELETE FROM recurring_operations WHERE id = ?").run(id);
}
function getPendingRecurringOperations() {
  const d = getDb();
  const currentMonth = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  return d.prepare(`
    SELECT r.*, c.name as category_name, c.color as category_color
    FROM recurring_operations r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.active = 1 AND (r.last_created IS NULL OR strftime('%Y-%m', r.last_created) < ?)
  `).all(currentMonth);
}
function confirmRecurringOperation(id, date) {
  const d = getDb();
  d.transaction(() => {
    const r = d.prepare("SELECT * FROM recurring_operations WHERE id = ?").get(id);
    d.prepare(`
      INSERT INTO operations (date, type, amount, category_id, subcategory_id, expense_type, account_id, comment, debt_id)
      VALUES (@date, @type, @amount, @category_id, @subcategory_id, @expense_type, NULL, @comment, NULL)
    `).run({
      date,
      type: r.type,
      amount: r.amount,
      category_id: r.category_id ?? null,
      subcategory_id: r.subcategory_id ?? null,
      expense_type: r.expense_type ?? null,
      comment: r.comment ?? null
    });
    d.prepare("UPDATE recurring_operations SET last_created = ? WHERE id = ?").run(date, id);
  })();
}
function getSummary(dateFrom, dateTo, expenseType) {
  const d = getDb();
  const income = d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='income' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const etClause = expenseType ? ` AND expense_type = '${expenseType}'` : "";
  const expense = d.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='expense'${etClause} AND date >= ? AND date <= ?`).get(dateFrom, dateTo).total;
  const debtOps = expenseType ? 0 : d.prepare("SELECT COALESCE(SUM(amount),0) as total FROM operations WHERE type='debt_op' AND date >= ? AND date <= ?").get(dateFrom, dateTo).total;
  const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 864e5) + 1);
  return { income, expense, debtOps, balance: income - expense - debtOps, avgPerDay: expense / days, avgPerDayWithDebt: (expense + debtOps) / days };
}
function getExpensesByCategory(dateFrom, dateTo, expenseType) {
  const etClause = expenseType ? ` AND o.expense_type = '${expenseType}'` : "";
  return getDb().prepare(`
    SELECT COALESCE(c.id, -1) as id, COALESCE(c.name, 'Без категории') as name, COALESCE(c.color, '#6B7280') as color, SUM(o.amount) as total
    FROM operations o
    LEFT JOIN categories c ON o.category_id = c.id
    WHERE o.type = 'expense'${etClause} AND o.date >= ? AND o.date <= ?
    GROUP BY COALESCE(c.id, -1) ORDER BY total DESC
  `).all(dateFrom, dateTo);
}
function getExpensesBySubcategory(categoryId, dateFrom, dateTo, expenseType) {
  const etClause = expenseType ? ` AND o.expense_type = '${expenseType}'` : "";
  return getDb().prepare(`
    SELECT COALESCE(s.id, -1) as id, COALESCE(s.name, 'Без подкатегории') as name, SUM(o.amount) as total
    FROM operations o
    LEFT JOIN subcategories s ON o.subcategory_id = s.id
    WHERE o.type = 'expense' AND o.category_id = ?${etClause} AND o.date >= ? AND o.date <= ?
    GROUP BY COALESCE(s.id, -1) ORDER BY total DESC
  `).all(categoryId, dateFrom, dateTo);
}
function getBigExpensesBreakdown(dateFrom, dateTo) {
  return getDb().prepare(`
    SELECT id, COALESCE(comment, date) as label, amount
    FROM operations
    WHERE type = 'expense' AND expense_type = 'big' AND date >= ? AND date <= ?
    ORDER BY amount DESC
  `).all(dateFrom, dateTo);
}
function getDailyExpenses(dateFrom, dateTo, expenseType) {
  const etFilter = expenseType ? ` AND expense_type = '${expenseType}'` : "";
  return getDb().prepare(`
    SELECT date,
      SUM(CASE WHEN type='expense'${etFilter} THEN amount ELSE 0 END) as expenses,
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
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN expense_type='daily' THEN amount ELSE 0 END) as daily,
           SUM(CASE WHEN expense_type='big' THEN amount ELSE 0 END) as big,
           SUM(CASE WHEN expense_type='apartment' THEN amount ELSE 0 END) as apartment
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
  const manualItems = d.prepare("SELECT * FROM mandatory_expense_plan WHERE year = ? AND month = ? ORDER BY id ASC").all(year, month);
  const debtItems = d.prepare("SELECT id, name, monthly_payment, debt_type FROM debts WHERE status = 'active' AND direction = 'i_owe' AND monthly_payment IS NOT NULL AND monthly_payment > 0").all();
  const manualTotal = manualItems.reduce((s, item) => s + (item.actual_amount ?? item.planned_amount), 0);
  const debtTotal = debtItems.reduce((s, debt) => s + debt.monthly_payment, 0);
  const mandatory = manualTotal + debtTotal;
  const dailyBudget = (income - mandatory) / lastDay;
  const dailyRows = d.prepare(`
    SELECT date, SUM(CASE WHEN type='expense' OR type='debt_op' THEN amount ELSE 0 END) as day_expenses
    FROM operations WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date ASC
  `).all(dateFrom, dateTo);
  const expensesByDate = new Map(dailyRows.map((r) => [r.date, r.day_expenses]));
  let prevSaldo = 0;
  const journal = [];
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayExpenses = expensesByDate.get(dateStr) ?? 0;
    const cumLimit = day === 1 ? dailyBudget : prevSaldo + dailyBudget;
    const saldo = cumLimit - dayExpenses;
    journal.push({
      date: dateStr,
      dayExpenses,
      cumLimit: Math.round(cumLimit * 100) / 100,
      saldo: Math.round(saldo * 100) / 100
    });
    prevSaldo = saldo;
  }
  const mandatoryItems = [
    ...manualItems.map((item) => ({
      id: item.id,
      category: item.category,
      plannedAmount: item.planned_amount,
      actualAmount: item.actual_amount,
      isDebtLinked: false,
      debtId: null
    })),
    ...debtItems.map((debt) => {
      const table = debt.debt_type === "dad" ? "dad_debt_payments" : "simple_debt_payments";
      const row = d.prepare(`SELECT COALESCE(SUM(total_amount),0) as paid FROM ${table} WHERE debt_id = ? AND payment_date >= ? AND payment_date <= ?`).get(debt.id, dateFrom, dateTo);
      return {
        id: null,
        category: debt.name,
        plannedAmount: debt.monthly_payment,
        actualAmount: row.paid > 0 ? row.paid : null,
        isDebtLinked: true,
        debtId: debt.id
      };
    })
  ];
  return { income, mandatory, dailyBudget, journal, dateFrom, dateTo, mandatoryItems };
}
function getMandatoryExpensePlan(year, month) {
  return getDb().prepare("SELECT * FROM mandatory_expense_plan WHERE year = ? AND month = ? ORDER BY id ASC").all(year, month);
}
function addMandatoryExpenseItem(year, month, category, plannedAmount) {
  const r = getDb().prepare("INSERT INTO mandatory_expense_plan (year, month, category, planned_amount) VALUES (?, ?, ?, ?)").run(year, month, category, plannedAmount);
  return r.lastInsertRowid;
}
function updateMandatoryExpenseItem(id, data) {
  const fields = Object.entries(data).filter(([, v]) => v !== void 0).map(([k]) => `${k} = @${k}`).join(", ");
  if (!fields) return;
  getDb().prepare(`UPDATE mandatory_expense_plan SET ${fields} WHERE id = @id`).run({ ...data, id });
}
function deleteMandatoryExpenseItem(id) {
  getDb().prepare("DELETE FROM mandatory_expense_plan WHERE id = ?").run(id);
}
function calcAccruedInterest(account, asOf) {
  const d = getDb();
  const lastInt = d.prepare(
    "SELECT MAX(date) as dt FROM savings_transactions WHERE account_id = ? AND type = 'interest'"
  ).get(account.id);
  const sinceStr = lastInt.dt ?? account.opened_at;
  const sinceDate = /* @__PURE__ */ new Date(sinceStr + "T00:00:00");
  const days = Math.max(0, Math.round((asOf.getTime() - sinceDate.getTime()) / 864e5));
  return account.balance * account.interest_rate * (days / 365);
}
function getSavingsAccounts() {
  const d = getDb();
  const accounts = d.prepare("SELECT * FROM savings_accounts WHERE status = 'active' ORDER BY sort_order ASC, id ASC").all();
  const today = /* @__PURE__ */ new Date();
  return accounts.map((a) => ({
    ...a,
    accrued_interest: calcAccruedInterest(a, today)
  }));
}
function getSavingsAccount(id) {
  const d = getDb();
  const a = d.prepare("SELECT * FROM savings_accounts WHERE id = ?").get(id);
  if (!a) return null;
  return { ...a, accrued_interest: calcAccruedInterest(a, /* @__PURE__ */ new Date()) };
}
function addSavingsAccount(data) {
  const d = getDb();
  return d.transaction(() => {
    const id = d.prepare(`
      INSERT INTO savings_accounts (name, balance, interest_rate, interest_mode, payout_period, goal_name, goal_amount, goal_date, auto_contribute_pct, notify_contribution, notify_day, color, opened_at)
      VALUES (@name, @balance, @interest_rate, @interest_mode, @payout_period, @goal_name, @goal_amount, @goal_date, @auto_contribute_pct, @notify_contribution, @notify_day, @color, @opened_at)
    `).run({
      name: data.name,
      balance: data.initial_balance ?? 0,
      interest_rate: data.interest_rate,
      interest_mode: data.interest_mode ?? "capitalize",
      payout_period: data.payout_period ?? "monthly",
      goal_name: data.goal_name ?? null,
      goal_amount: data.goal_amount ?? null,
      goal_date: data.goal_date ?? null,
      auto_contribute_pct: data.auto_contribute_pct ?? null,
      notify_contribution: data.notify_contribution ?? 0,
      notify_day: data.notify_day ?? null,
      color: data.color ?? "#22C55E",
      opened_at: data.opened_at ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
    }).lastInsertRowid;
    if (data.initial_balance && data.initial_balance > 0) {
      d.prepare(
        "INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'deposit', ?, ?, 'Начальный баланс')"
      ).run(id, data.initial_balance, data.opened_at ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
    }
    return id;
  })();
}
function updateSavingsAccount(id, data) {
  const allowed = ["name", "interest_rate", "interest_mode", "payout_period", "goal_name", "goal_amount", "goal_date", "auto_contribute_pct", "notify_contribution", "notify_day", "color", "status", "sort_order"];
  const updates = Object.entries(data).filter(([k]) => allowed.includes(k));
  if (!updates.length) return;
  const fields = updates.map(([k]) => `${k} = @${k}`).join(", ");
  getDb().prepare(`UPDATE savings_accounts SET ${fields} WHERE id = @id`).run({ ...Object.fromEntries(updates), id });
}
function deleteSavingsAccount(id) {
  const d = getDb();
  d.transaction(() => {
    d.prepare("DELETE FROM savings_transactions WHERE account_id = ?").run(id);
    d.prepare("DELETE FROM savings_accounts WHERE id = ?").run(id);
  })();
}
function getSavingsTransactions(accountId) {
  return getDb().prepare("SELECT * FROM savings_transactions WHERE account_id = ? ORDER BY date DESC, id DESC").all(accountId);
}
function addSavingsDeposit(accountId, amount, date, comment) {
  const d = getDb();
  d.transaction(() => {
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'deposit', ?, ?, ?)").run(accountId, amount, date, comment ?? null);
    d.prepare("UPDATE savings_accounts SET balance = balance + ? WHERE id = ?").run(amount, accountId);
    let catId = d.prepare("SELECT id FROM categories WHERE name = 'Накопления' AND type = 'expense'").get()?.id;
    if (!catId) {
      catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Накопления', 'expense', '#22C55E', 'piggy-bank')").run().lastInsertRowid;
    }
    const opId = d.prepare("INSERT INTO operations (date, type, amount, category_id, expense_type, comment) VALUES (?, 'expense', ?, ?, 'daily', ?)").run(date, amount, catId, comment ?? "Пополнение накопительного счёта").lastInsertRowid;
    d.prepare("UPDATE savings_transactions SET linked_operation_id = ? WHERE account_id = ? AND type = ? AND date = ? AND linked_operation_id IS NULL ORDER BY id DESC LIMIT 1").run(opId, accountId, "deposit", date);
  })();
}
function addSavingsWithdrawal(accountId, amount, date, comment) {
  const d = getDb();
  d.transaction(() => {
    const acc = d.prepare("SELECT balance FROM savings_accounts WHERE id = ?").get(accountId);
    if (acc.balance < amount) throw new Error("Insufficient balance");
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'withdrawal', ?, ?, ?)").run(accountId, amount, date, comment ?? null);
    d.prepare("UPDATE savings_accounts SET balance = balance - ? WHERE id = ?").run(amount, accountId);
    let catId = d.prepare("SELECT id FROM categories WHERE name = 'Снятие с накоплений' AND type = 'income'").get()?.id;
    if (!catId) {
      catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Снятие с накоплений', 'income', '#6366F1', 'wallet')").run().lastInsertRowid;
    }
    const opId = d.prepare("INSERT INTO operations (date, type, amount, category_id, comment) VALUES (?, 'income', ?, ?, ?)").run(date, amount, catId, comment ?? "Снятие с накопительного счёта").lastInsertRowid;
    d.prepare("UPDATE savings_transactions SET linked_operation_id = ? WHERE account_id = ? AND type = ? AND date = ? AND linked_operation_id IS NULL ORDER BY id DESC LIMIT 1").run(opId, accountId, "withdrawal", date);
  })();
}
function applyAccruedInterest(accountId) {
  const d = getDb();
  const acc = d.prepare("SELECT * FROM savings_accounts WHERE id = ?").get(accountId);
  if (!acc) return;
  const today = /* @__PURE__ */ new Date();
  const amount = calcAccruedInterest(acc, today);
  if (amount < 0.01) return;
  const dateStr = today.toISOString().slice(0, 10);
  d.transaction(() => {
    d.prepare("INSERT INTO savings_transactions (account_id, type, amount, date, comment) VALUES (?, 'interest', ?, ?, 'Начисление процентов')").run(accountId, amount, dateStr);
    if (acc.interest_mode === "capitalize") {
      d.prepare("UPDATE savings_accounts SET balance = balance + ? WHERE id = ?").run(amount, accountId);
    } else {
      let catId = d.prepare("SELECT id FROM categories WHERE name = 'Проценты по счёту' AND type = 'income'").get()?.id;
      if (!catId) {
        catId = d.prepare("INSERT INTO categories (name, type, color, icon) VALUES ('Проценты по счёту', 'income', '#F59E0B', 'percent')").run().lastInsertRowid;
      }
      d.prepare("INSERT INTO operations (date, type, amount, category_id, comment) VALUES (?, 'income', ?, ?, 'Проценты по накопительному счёту')").run(dateStr, amount, catId);
    }
  })();
}
function getPendingSavingsInterest() {
  const d = getDb();
  const accounts = d.prepare("SELECT * FROM savings_accounts WHERE status = 'active' AND interest_rate > 0").all();
  const today = /* @__PURE__ */ new Date();
  const result = [];
  for (const acc of accounts) {
    const lastInt = d.prepare(
      "SELECT MAX(date) as dt FROM savings_transactions WHERE account_id = ? AND type = 'interest'"
    ).get(acc.id);
    const sinceStr = lastInt.dt ?? acc.opened_at;
    const sinceDate = /* @__PURE__ */ new Date(sinceStr + "T00:00:00");
    const days = Math.round((today.getTime() - sinceDate.getTime()) / 864e5);
    if (days < 1) continue;
    const amount = acc.balance * acc.interest_rate * (days / 365);
    if (amount < 0.01) continue;
    if (acc.payout_period === "monthly") {
      const lastMonth = sinceDate.getFullYear() * 12 + sinceDate.getMonth();
      const thisMonth = today.getFullYear() * 12 + today.getMonth();
      if (thisMonth <= lastMonth) continue;
    }
    result.push({ id: acc.id, name: acc.name, days, amount, accrued_interest: amount });
  }
  return result;
}
function getSavingsForecast(accountId, monthlyContribution, months) {
  const d = getDb();
  const acc = d.prepare("SELECT * FROM savings_accounts WHERE id = ?").get(accountId);
  if (!acc) return [];
  let balance = acc.balance + calcAccruedInterest(acc, /* @__PURE__ */ new Date());
  const result = [];
  for (let m = 1; m <= months; m++) {
    balance += monthlyContribution;
    const monthlyInterest = balance * acc.interest_rate / 12;
    if (acc.interest_mode === "capitalize") {
      balance += monthlyInterest;
    }
    result.push({
      month: m,
      contribution: monthlyContribution,
      interest: monthlyInterest,
      balance,
      progress: acc.goal_amount ? balance / acc.goal_amount : null
    });
    if (acc.goal_amount && balance >= acc.goal_amount) break;
  }
  return result;
}
function updateSavingsAccountsOrder(ids) {
  const d = getDb();
  const stmt = d.prepare("UPDATE savings_accounts SET sort_order = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i, id));
}
function getAccountsForAutoContribute() {
  return getDb().prepare("SELECT id, name, auto_contribute_pct FROM savings_accounts WHERE status = 'active' AND auto_contribute_pct > 0").all();
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
  electron.ipcMain.handle("get-debts-with-balance", () => getDebtsWithBalance());
  electron.ipcMain.handle("get-debts-with-details", () => getDebtsWithDetails());
  electron.ipcMain.handle("get-debt", (_, id) => getDebt(id));
  electron.ipcMain.handle("add-debt", (_, debt) => addDebt(debt));
  electron.ipcMain.handle("update-debt", (_, id, data) => updateDebt(id, data));
  electron.ipcMain.handle("delete-debt", (_, id) => deleteDebt(id));
  electron.ipcMain.handle("get-tranches", (_, debtId) => getTranches(debtId));
  electron.ipcMain.handle("add-tranche", (_, tranche) => addTranche(tranche));
  electron.ipcMain.handle("update-tranche", (_, id, data) => updateTranche(id, data));
  electron.ipcMain.handle("delete-tranche", (_, id) => deleteTranche(id));
  electron.ipcMain.handle("update-debts-order", (_, ids) => updateDebtsOrder(ids));
  electron.ipcMain.handle("get-days-since-last-payment", (_, debtId, date) => getDaysSinceLastPayment(debtId, date));
  electron.ipcMain.handle("process-dad-payment", (_, debtId, amount, date) => processDadPayment(debtId, amount, date));
  electron.ipcMain.handle("get-dad-payment-history", (_, debtId) => getDadPaymentHistory(debtId));
  electron.ipcMain.handle("get-simple-debt-payments", (_, debtId) => getSimpleDebtPayments(debtId));
  electron.ipcMain.handle("process-simple-payment", (_, debtId, amount, date, interestPart) => processSimplePayment(debtId, amount, date, interestPart));
  electron.ipcMain.handle("get-dad-forecast", (_, debtId, payment) => getDadForecast(debtId, payment));
  electron.ipcMain.handle("get-simple-forecast", (_, debtId, payment) => getSimpleForecast(debtId, payment));
  electron.ipcMain.handle("mark-dad-payment-sufficient", (_, paymentId) => markDadPaymentSufficient(paymentId));
  electron.ipcMain.handle("delete-dad-payment", (_, paymentId) => deleteDadPayment(paymentId));
  electron.ipcMain.handle("update-dad-payment", (_, paymentId, date, amount) => updateDadPayment(paymentId, date, amount));
  electron.ipcMain.handle("delete-simple-debt-payment", (_, paymentId) => deleteSimpleDebtPayment(paymentId));
  electron.ipcMain.handle("update-simple-debt-payment", (_, paymentId, amount, date, interestPart) => updateSimpleDebtPayment(paymentId, amount, date, interestPart));
  electron.ipcMain.handle("has-dad-payments-after", (_, paymentId) => hasDadPaymentsAfter(paymentId));
  electron.ipcMain.handle("has-simple-payments-after", (_, paymentId) => hasSimplePaymentsAfter(paymentId));
  electron.ipcMain.handle("get-recurring-operations", (_, activeOnly) => getRecurringOperations(activeOnly));
  electron.ipcMain.handle("add-recurring-operation", (_, r) => addRecurringOperation(r));
  electron.ipcMain.handle("update-recurring-operation", (_, id, data) => updateRecurringOperation(id, data));
  electron.ipcMain.handle("delete-recurring-operation", (_, id) => deleteRecurringOperation(id));
  electron.ipcMain.handle("get-pending-recurring-operations", () => getPendingRecurringOperations());
  electron.ipcMain.handle("confirm-recurring-operation", (_, id, date) => confirmRecurringOperation(id, date));
  electron.ipcMain.handle("get-savings-accounts", () => getSavingsAccounts());
  electron.ipcMain.handle("get-savings-account", (_, id) => getSavingsAccount(id));
  electron.ipcMain.handle("add-savings-account", (_, data) => addSavingsAccount(data));
  electron.ipcMain.handle("update-savings-account", (_, id, data) => updateSavingsAccount(id, data));
  electron.ipcMain.handle("delete-savings-account", (_, id) => deleteSavingsAccount(id));
  electron.ipcMain.handle("get-savings-transactions", (_, accountId) => getSavingsTransactions(accountId));
  electron.ipcMain.handle("add-savings-deposit", (_, accountId, amount, date, comment) => addSavingsDeposit(accountId, amount, date, comment));
  electron.ipcMain.handle("add-savings-withdrawal", (_, accountId, amount, date, comment) => addSavingsWithdrawal(accountId, amount, date, comment));
  electron.ipcMain.handle("apply-accrued-interest", (_, accountId) => applyAccruedInterest(accountId));
  electron.ipcMain.handle("get-pending-savings-interest", () => getPendingSavingsInterest());
  electron.ipcMain.handle("get-savings-forecast", (_, accountId, monthlyContribution, months) => getSavingsForecast(accountId, monthlyContribution, months));
  electron.ipcMain.handle("update-savings-accounts-order", (_, ids) => updateSavingsAccountsOrder(ids));
  electron.ipcMain.handle("get-accounts-for-auto-contribute", () => getAccountsForAutoContribute());
  electron.ipcMain.handle("get-summary", (_, dateFrom, dateTo, expenseType) => getSummary(dateFrom, dateTo, expenseType));
  electron.ipcMain.handle("get-expenses-by-category", (_, dateFrom, dateTo, expenseType) => getExpensesByCategory(dateFrom, dateTo, expenseType));
  electron.ipcMain.handle("get-expenses-by-subcategory", (_, categoryId, dateFrom, dateTo, expenseType) => getExpensesBySubcategory(categoryId, dateFrom, dateTo, expenseType));
  electron.ipcMain.handle("get-big-expenses-breakdown", (_, dateFrom, dateTo) => getBigExpensesBreakdown(dateFrom, dateTo));
  electron.ipcMain.handle("get-daily-expenses", (_, dateFrom, dateTo, expenseType) => getDailyExpenses(dateFrom, dateTo, expenseType));
  electron.ipcMain.handle("get-expenses-by-type", (_, dateFrom, dateTo) => getExpensesByType(dateFrom, dateTo));
  electron.ipcMain.handle("get-monthly-expenses", (_, dateFrom, dateTo) => getMonthlyExpenses(dateFrom, dateTo));
  electron.ipcMain.handle("get-expenses-by-day-of-week", (_, dateFrom, dateTo) => getExpensesByDayOfWeek(dateFrom, dateTo));
  electron.ipcMain.handle("get-budget-settings", () => getBudgetSettings());
  electron.ipcMain.handle("set-budget-setting", (_, key, value) => setBudgetSetting(key, value));
  electron.ipcMain.handle("get-cash-flow", (_, year, month) => getCashFlow(year, month));
  electron.ipcMain.handle("get-mandatory-expense-plan", (_, year, month) => getMandatoryExpensePlan(year, month));
  electron.ipcMain.handle("add-mandatory-expense-item", (_, year, month, category, amount) => addMandatoryExpenseItem(year, month, category, amount));
  electron.ipcMain.handle("update-mandatory-expense-item", (_, id, data) => updateMandatoryExpenseItem(id, data));
  electron.ipcMain.handle("delete-mandatory-expense-item", (_, id) => deleteMandatoryExpenseItem(id));
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
