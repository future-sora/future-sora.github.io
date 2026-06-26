import { useEffect } from 'react'

/** 저장·삭제 등 처리 중 전체 화면을 덮어 입력·스크롤을 막고 캐릭터 로딩을 보여준다. */
export function LoadingOverlay({ show, label = '저장 중…' }: { show: boolean; label?: string }) {
  // 떠 있는 동안 배경 스크롤 차단.
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [show])

  if (!show) return null
  return (
    <div className="loading-overlay" role="alertdialog" aria-busy="true" aria-label={label}>
      <div className="loading-box">
        <img className="loading-img" src="/img/char-head.png" alt="" />
        <p>{label}</p>
      </div>
    </div>
  )
}
