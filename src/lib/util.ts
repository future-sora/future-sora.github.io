export function newId(): string {
  return crypto.randomUUID()
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "490", "1.5" 같은 만원 금액 표기 (불필요한 0 제거). */
export function fmtMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
