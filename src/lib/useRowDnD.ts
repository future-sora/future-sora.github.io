import { useRef, type DragEvent } from 'react'

/**
 * 표 행 드래그 재배치. 드래그 핸들에 `handle(key)`, 드롭 대상(행)에 `zone(key)`를 편다.
 * key는 행 식별자(인덱스 또는 {type,i} 같은 객체). 드롭 시 onReorder(from, to) 호출.
 */
export function useRowDnD<K>(onReorder: (from: K, to: K) => void) {
  const from = useRef<K | null>(null)
  return {
    handle: (key: K) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        from.current = key
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => {
        from.current = null
      },
    }),
    zone: (key: K) => ({
      onDragOver: (e: DragEvent) => {
        if (from.current !== null) e.preventDefault()
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        const f = from.current
        from.current = null
        if (f !== null) onReorder(f, key)
      },
    }),
  }
}
