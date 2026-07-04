import React, { useState, useRef } from 'react'
import { HelpCircle } from 'lucide-react'

interface Props {
  text: string
}

export default function InfoTooltip({ text }: Props) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        className="text-gray-500 hover:text-gray-300 transition-colors"
        type="button"
      >
        <HelpCircle size={14} />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-60 bg-dark-700 border border-dark-500 rounded-xl p-3 shadow-xl pointer-events-none">
          <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-700" />
        </div>
      )}
    </div>
  )
}
