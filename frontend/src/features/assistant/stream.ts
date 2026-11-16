import { lang, t } from '@/shared/lib/i18n'
import { td, translateResponse } from '@/shared/lib/i18n-data'
import type { ApiMessage, ChatEvent, Screen } from '@/features/assistant/types'

const MAX_SCREEN_ROWS = 5000

/** Um evento do servidor, com as falhas e as fichas no idioma da interface. */
function parse(line: string): ChatEvent {
  const event = JSON.parse(line) as ChatEvent
  if (event.type === 'error') return { ...event, message: td(event.message) }
  // as fichas dos estudos vêm do banco, como nas páginas
  return event.type === 'studies' ? translateResponse(event) : event
}

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
    body: JSON.stringify({ screen: { ...screen, dados, colunas }, history, question, lang }),
    signal,
  })
  if (!response.ok || !response.body) {
    let message = t(`The server responded with ${response.status}.`, `O servidor respondeu ${response.status}.`)
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') message = td(body.detail)
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
    for (const line of lines) if (line.trim()) yield parse(line)
  }
  if (buffer.trim()) yield parse(buffer)
}
