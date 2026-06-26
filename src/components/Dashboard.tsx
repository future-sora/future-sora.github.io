import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useData } from '../data/DataContext'
import {
  savingsTrend,
  summarizeMonth,
  savingsRate,
  expenseByItem,
  listMonths,
} from '../domain/aggregate'
import { currentMonth } from '../lib/util'
import { MonthDropdown } from './MonthDropdown'

export function Dashboard() {
  const { ledger } = useData()
  const months = useMemo(() => listMonths(ledger), [ledger])
  const [month, setMonth] = useState(() => months[0] ?? currentMonth())
  const [metric, setMetric] = useState<'amount' | 'rate'>('amount')

  useEffect(() => {
    if (months.length > 0 && !months.includes(month)) setMonth(months[0])
  }, [months, month])

  const trend = useMemo(() => savingsTrend(ledger), [ledger])
  const summary = useMemo(() => summarizeMonth(ledger, month), [ledger, month])
  const rate = savingsRate(summary)
  const byItem = useMemo(() => expenseByItem(ledger, month), [ledger, month])

  if (ledger.length === 0) {
    return (
      <p className="muted">
        데이터가 없습니다. ‘월별 입력’에서 항목을 추가하면 차트가 표시됩니다.
      </p>
    )
  }

  return (
    <section>
      <div className="chart-head">
        <h3>
          {metric === 'amount'
            ? '월별 최종저축·소득 추이 (만원)'
            : '월별 저축률 추이 (%)'}
        </h3>
        <div className="metric-toggle" role="group" aria-label="지표 선택">
          <button
            type="button"
            className={metric === 'amount' ? 'active' : ''}
            onClick={() => setMetric('amount')}
          >
            금액
          </button>
          <button
            type="button"
            className={metric === 'rate' ? 'active' : ''}
            onClick={() => setMetric('rate')}
          >
            저축률
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        {metric === 'amount' ? (
          <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="savable"
              name="최종저축"
              stroke="#243b53"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="income"
              name="소득"
              stroke="#0d9488"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        ) : (
          <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
            <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
            <Line
              type="monotone"
              dataKey="rate"
              name="저축률"
              stroke="#243b53"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>

      <div className="dash-controls">
        <MonthDropdown value={month} options={months} onChange={setMonth} />
        <span className="rate">
          저축률 <strong>{(rate * 100).toFixed(1)}%</strong>
          {' '}(소득 {summary.total.income} · 저축가능 {summary.total.savable})
        </span>
      </div>

      <h3>{month} 항목별 지출 (만원)</h3>
      {byItem.length === 0 ? (
        <p className="muted">이 달 지출이 없습니다.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byItem} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="item" fontSize={12} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="amount" name="지출" fill="#243b53" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
