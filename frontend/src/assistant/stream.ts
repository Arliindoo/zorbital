import type { ApiMessage, ChatEvent, Screen } from './types'

const MAX_SCREEN_ROWS = 5000

/** Faz a pergunta e rende os eventos NDJSON conforme chegam. */
export async function* ask(
  screen: Screen,
  history: ApiMessage[],
  question: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const dados = screen.dados ? screen.dados.slice(0, MAX_SCREEN_ROWS) : null
  const colunas = screen.colunas ?? (dados?.[0] ? Object.keys(dados[0]) : null)
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ screen: { ...screen, dados, colunas }, history, question }),
    signal,
  })
  if (!response.ok || !response.body) {
    let message = `O servidor respondeu ${response.status}.`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // corpo não é JSON
    }
    yield { type: 'error', message }
    return
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as ChatEvent
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatEvent
}
