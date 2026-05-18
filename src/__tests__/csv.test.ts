import { describe, it, expect } from 'vitest'
import { rowsToCsv, buildExportFilename } from '@/lib/csv'

describe('rowsToCsv', () => {
  it('produces header row + data rows', () => {
    const rows = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]
    expect(rowsToCsv(rows)).toBe('name,age\nAlice,30\nBob,25')
  })
  it('wraps values containing commas in double quotes', () => {
    expect(rowsToCsv([{ city: 'London, UK', n: 5 }])).toBe('city,n\n"London, UK",5')
  })
  it('returns empty string for empty array', () => {
    expect(rowsToCsv([])).toBe('')
  })
})

describe('buildExportFilename', () => {
  it('builds a descriptive filename', () => {
    expect(buildExportFilename('SG', 'all', '2026-01', '2026-05')).toBe(
      'tss-report-SG-all-2026-01-2026-05.csv'
    )
  })
})
