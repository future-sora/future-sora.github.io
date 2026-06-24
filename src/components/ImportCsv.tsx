import { useState, type ChangeEvent } from 'react'
import { useData } from '../data/DataContext'
import { importLedger } from '../lib/repo'
import { parseLedgerCsv, type ImportResult } from '../lib/csv'

export function ImportCsv() {
  const { reload } = useData()
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      setResult(null)
      setDone(null)
      setErr(null)
    }
    reader.readAsText(file)
  }

  function preview() {
    setResult(parseLedgerCsv(text))
    setDone(null)
    setErr(null)
  }

  async function doImport() {
    if (!result || result.valid.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      await importLedger(result.valid)
      await reload()
      setDone(`${result.valid.length}건을 가져왔습니다.`)
      setText('')
      setResult(null)
    } catch {
      setErr('가져오기에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>CSV 가져오기</h3>
      <p className="muted">
        형식: <code>month,person,type,item,amount</code> (헤더 줄은 선택).
        예: <code>2026-06,소라삐,소비,용돈,70</code>
      </p>
      <p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
      </p>
      <textarea
        rows={8}
        placeholder="또는 CSV를 여기에 붙여넣기"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setResult(null)
        }}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />
      <p>
        <button type="button" onClick={preview} disabled={busy || !text.trim()}>
          미리보기
        </button>{' '}
        <button
          type="button"
          onClick={doImport}
          disabled={busy || !result || result.valid.length === 0}
        >
          {busy ? '가져오는 중…' : '가져오기'}
        </button>
      </p>
      {result && (
        <div>
          <p>
            유효 {result.valid.length}건, 오류 {result.errors.length}건
          </p>
          {result.errors.length > 0 && (
            <ul className="error">
              {result.errors.slice(0, 10).map((e) => (
                <li key={e.line}>
                  줄 {e.line}: {e.reason}
                </li>
              ))}
              {result.errors.length > 10 && (
                <li>… 외 {result.errors.length - 10}건</li>
              )}
            </ul>
          )}
        </div>
      )}
      {done && <p>{done}</p>}
      {err && <p className="error">{err}</p>}
    </section>
  )
}
