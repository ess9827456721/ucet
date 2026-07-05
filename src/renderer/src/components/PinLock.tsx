import React, { useState } from 'react'
import { Lock } from 'lucide-react'

// Экран ввода PIN при запуске (ТЗ #18, Этап 7.13).
// Хеш совпадает с алгоритмом в SettingsPage.savePin.
function hashPin(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) hash = (hash * 31 + pin.charCodeAt(i)) | 0
  return String(hash)
}

export default function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (hashPin(pin) === localStorage.getItem('ucet-pin')) {
      onUnlock()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-dark-900">
      <form onSubmit={submit} className="card w-80 space-y-4 text-center">
        <Lock size={32} className="text-yellow-400 mx-auto" />
        <h1 className="text-lg font-semibold text-white">Введите PIN-код</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(false) }}
          className="input text-center text-2xl tracking-widest"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-sm">Неверный PIN-код</p>}
        <button type="submit" className="btn-primary w-full">Войти</button>
      </form>
    </div>
  )
}
