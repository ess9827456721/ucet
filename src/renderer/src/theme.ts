// Управление темой (ТЗ #18, Этап 7.11). Тёмная — по умолчанию.
export type Theme = 'dark' | 'light'

const KEY = 'ucet-theme'

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) || 'dark'
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  document.documentElement.classList.toggle('light', theme === 'light')
}

// Применяется как можно раньше при старте
export function initTheme(): void {
  setTheme(getTheme())
}
