# Zorbital — combustão em microgravidade

**NASA Space Apps Challenge 2026 · Flame in Freefall** · *English version: [README.md](README.md)*

Painel interativo que reúne os experimentos públicos da NASA sobre combustão em microgravidade
(repositório PSI), normaliza os dados em tabelas comparáveis, guarda a origem de cada número, diz o
que cada experimento pode e não pode afirmar, e acrescenta um assistente de IA que só fala do que
está na tela.

## O problema

O acervo é rico e difícil de usar: cada investigação publicou os dados do seu jeito (uma aba por
pesquisador, pares de colunas lado a lado, categorias em texto livre, unidades no cabeçalho ou em
lugar nenhum); medição e simulação ficam na mesma tabela; parte das "medições" de um estudo são os
voos de outro; e as armadilhas de cada experimento (um `0` que quer dizer "não houve extinção", uma
leitura de painel que não é velocidade) estão nos relatórios, não nas tabelas. Um chat genérico de
IA responde com fluência sobre números que não existem.

## O que o painel faz

- **Seis investigações prontas para explorar**: FLEX (PSI-69), CFI (PSI-39), PSI-117, BASS-II
  (PSI-25), PSI-142 e BASS (PSI-26), cada uma com a pergunta que responde, a fonte, a completude, os
  alertas de qualidade e as cautelas ("o que não concluir").
- **Ficha de cada estudo**, calculada dos dados: combustíveis, amostras, condições na mesma unidade,
  o que se mediu, o que variou e o que ficou fixo, e as condições que variaram juntas. Com os
  documentos do estudo, a ficha ganha objetivo, sensores e condições fixas, com a página de origem.
- **Simulação 3D por estudo**: uma reconstrução em WebGL2 que desce da ISS ou do laboratório até o
  experimento e reproduz o ensaio escolhido a partir dos valores da fonte; a tela diz, ensaio a
  ensaio, o que é dado e o que é ilustração, e nada é inventado quando falta o dado.
- **Comparações com regras**: PSI-117 × CFI com correspondência ponto a ponto (não é validação
  independente), e **Fichas lado a lado**, com veredito por par.
- **Assistente por página**, que só usa consultas prontas aos dados daquela página e mostra o custo
  de cada pergunta.
- **Envio de estudos novos**: a IA propõe como ler cada coluna, com evidência; uma pessoa revisa e
  aprova; o código passa a carregar o estudo igual em toda carga.

A regra que atravessa tudo: **a IA propõe, o código aplica, uma pessoa aprova.** Nenhum número na
tela vem da IA; medido, simulado e incerteza nunca entram na mesma conta.

## Rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/) e Node.js 22 ou mais novo. O painel tem duas partes:
a **API** em Python (FastAPI) e o **front-end** em React + Vite.

```bash
uv sync && cp .env.example .env               # credencial de IA é opcional
uv run uvicorn spaceapps.api.app:app --reload # API em http://localhost:8000
cd frontend && npm install && npm run dev     # painel em http://localhost:5173
```

Produção, num processo só: `npm --prefix frontend ci && npm --prefix frontend run build` e
`uv run spaceapps-serve` (http://localhost:8000).

Quem clona não baixa nada: ao subir, a API monta o banco a partir de `seed/`. Sem credencial de IA,
tudo funciona menos o assistente e o envio de estudos. A interface vem em inglês, com português nas
configurações. `uv run spaceapps-build` refaz banco e seed a partir de `dados/`; `uv run pytest`
roda os testes do Python e `npm --prefix frontend test` os do front-end.

## Dados da NASA, referências, uso de IA e equipe

Estão no [README.md](README.md), em inglês, que é a versão enviada ao Space Apps. A documentação
técnica (arquitetura, dados, decisões, validação) está em [`docs/`](docs/README.md).

O projeto mostra evidências e seus limites; não prevê incêndios nem dá orientação operacional de
segurança, e não tem vínculo nem endosso da NASA.
