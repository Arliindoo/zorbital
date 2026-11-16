import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _node, ...props }) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
}

/** Markdown do banco (cautelas, avisos) e das respostas do assistente. HTML cru não é interpretado. */
export function Markdown({ children, inline = false }: { children: string; inline?: boolean }) {
  return (
    <div className={inline ? 'markdown markdown--inline' : 'markdown'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
