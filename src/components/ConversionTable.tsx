import { formatMonthLabel } from '@/lib/utils'
import type { MonthlyRow, PeriodSummary } from '@/types'

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  col1Header: string
  col2Header: string
  accentColor: string
  startLabel: string
  endLabel: string
}

export function ConversionTable({
  rows,
  summary,
  col1Header,
  col2Header,
  accentColor,
  startLabel,
  endLabel,
}: Props) {
  const totalBg = `${accentColor}12`

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50">
          {['Month', col1Header, col2Header, 'Rate'].map((header, index) => (
            <th
              key={header}
              className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                index === 0 ? 'text-left' : 'text-right'
              }`}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month} className="border-b border-slate-100">
            <td className="px-5 py-2 text-slate-700">{formatMonthLabel(row.month)}</td>
            <td className="px-5 py-2 text-right text-slate-700">{row.col1}</td>
            <td className="px-5 py-2 text-right text-slate-700">{row.col2}</td>
            <td className="px-5 py-2 text-right font-semibold" style={{ color: accentColor }}>
              {row.rate}%
            </td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${accentColor}`, backgroundColor: totalBg }}>
          <td className="px-5 py-2.5 font-bold text-slate-900">
            Total ({startLabel}–{endLabel})
          </td>
          <td className="px-5 py-2.5 text-right font-bold text-slate-900">
            {summary.denominator}
          </td>
          <td className="px-5 py-2.5 text-right font-bold text-slate-900">
            {summary.numerator}
          </td>
          <td className="px-5 py-2.5 text-right font-bold" style={{ color: accentColor }}>
            {summary.rate}%
          </td>
        </tr>
      </tbody>
    </table>
  )
}
