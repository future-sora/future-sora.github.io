import { useEffect, useRef, useState } from 'react'

/** 월 선택 드롭다운(목록은 스크롤). 네이티브 select 대신 높이 제어용. */
export function MonthDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div className="month-dd" ref={ref}>
      <button
        type="button"
        className="month-dd-btn"
        aria-label="월 선택"
        onClick={() => setOpen((o) => !o)}
      >
        {value} ▾
      </button>
      {open && (
        <ul className="month-dd-list">
          {options.map((m) => (
            <li key={m}>
              <button
                type="button"
                className={m === value ? 'active' : ''}
                onClick={() => {
                  onChange(m)
                  setOpen(false)
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
