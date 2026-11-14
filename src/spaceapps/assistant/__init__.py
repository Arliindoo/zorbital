"""Assistente de chat que explica os dados da tela, com escopo limitado por página.

- `screen`: o que a página está mostrando (filtros, gráficos, linhas filtradas).
- `tools`: as ferramentas, organizadas em grupos, e quais grupos cada página liga.
- `provider`: o cliente da Zyria (API compatível com a da OpenAI).
- `agent`: o laço pergunta → ferramentas → resposta.
"""
