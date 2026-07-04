# Учёт финансов

Десктоп-приложение для учёта личных финансов на Electron + React + SQLite.

## Требования

- **Node.js** версии 18 или новее — [nodejs.org](https://nodejs.org/)
- **npm** (устанавливается вместе с Node.js)
- Windows 10/11 или macOS 12+

Проверить, что Node.js установлен:
```
node --version
npm --version
```

---

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone https://github.com/ess9827456721/ucet.git
cd ucet
```

### 2. Установить зависимости

```bash
npm install
```

> ⚠️ На Windows может потребоваться [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) для компиляции `better-sqlite3` (нативный модуль).
> Во время установки выберите компонент **"Desktop development with C++"**.

### 3. Запустить в режиме разработки

```bash
npm run dev
```

Откроется окно приложения. Изменения в коде применяются автоматически (hot reload).

---

## Сборка установочного файла

Для создания `.exe` (Windows) или `.dmg` (macOS):

```bash
npm run build
npm run package
```

Готовый установщик появится в папке `dist/`.

---

## Скрипты

| Команда | Описание |
|---|---|
| `npm run dev` | Запуск в режиме разработки |
| `npm run build` | Сборка production-бандла |
| `npm run package` | Создание установочного файла |
| `npm test` | Запуск unit-тестов алгоритма |

---

## Где хранятся данные

База данных SQLite хранится локально на диске:

- **Windows:** `C:\Users\<ИМЯ_ПОЛЬЗОВАТЕЛЯ>\AppData\Roaming\ucet\ucet.db`
- **macOS:** `~/Library/Application Support/ucet/ucet.db`

Данные не передаются в интернет. Приложение работает полностью офлайн.

### Резервное копирование

В разделе **Настройки** → **Резервное копирование** доступны кнопки:
- **Экспортировать базу данных** — сохранить `.db`-файл в любое место
- **Импортировать базу данных** — восстановить из ранее сохранённого файла

---

## Решение проблем

### `better-sqlite3` не собирается на Windows

Установите Build Tools:
```
npm install --global windows-build-tools
```
или скачайте вручную: https://visualstudio.microsoft.com/visual-cpp-build-tools/

### Приложение не запускается после `npm run dev`

Убедитесь, что Node.js ≥ 18:
```
node --version
```

Попробуйте удалить `node_modules` и переустановить:
```
rm -rf node_modules
npm install
```

### Экран остаётся белым (blank window)

Дождитесь полной загрузки — при первом запуске Vite компилирует модули (~5–10 секунд).

---

## Структура проекта

```
ucet/
├── src/
│   ├── main/           # Electron main-процесс
│   │   ├── index.ts        # Точка входа, IPC-обработчики
│   │   ├── database.ts     # SQLite: схема БД, все запросы
│   │   └── debtAlgorithm.ts # Алгоритм расчёта долга папе (чистые функции)
│   ├── preload/        # IPC-мост renderer ↔ main
│   └── renderer/src/   # React-приложение
│       ├── pages/          # Экраны: дашборд, операции, кассовый поток, долги
│       ├── components/     # Переиспользуемые компоненты (формы, модалки)
│       ├── hooks/          # useApi — типизированный доступ к IPC
│       └── utils.ts        # Форматирование чисел, дат, расчёт периодов
└── out/                # Скомпилированный бандл (после npm run build)
```
