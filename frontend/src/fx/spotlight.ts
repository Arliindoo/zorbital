/** Um ouvinte só para a página toda: grava a posição do ponteiro no painel sob ele (--mx/--my). */
export function installSpotlight(): () => void {
  let frame = 0
  const onMove = (event: PointerEvent) => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const panel = (event.target as Element | null)?.closest?.<HTMLElement>('.panel, .inv-card')
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      panel.style.setProperty('--mx', `${event.clientX - rect.left}px`)
      panel.style.setProperty('--my', `${event.clientY - rect.top}px`)
    })
  }
  document.addEventListener('pointermove', onMove, { passive: true })
  return () => document.removeEventListener('pointermove', onMove)
}
