# Zorbital — pesquisa assistida por IA e simulação

**NASA Space Apps Challenge 2026 · Flame in Freefall** · *English version: [README.md](README.md)*

O Zorbital tem como direção uma plataforma centrada na pesquisa do próprio usuário. Cientistas,
engenheiros e outros pesquisadores trazem dados, documentos e perguntas; a plataforma deve ajudar
a buscar trabalhos relacionados na NASA, relacionar evidências e explorar condições alteradas,
como gravidade e pressão, por simulação preditiva com visualização 3D. A IA auxilia a investigação;
o pesquisador constrói a conclusão científica.

O agente de simulação planejado deve transformar a pergunta em um cenário executável: propor
modelos científicos adequados, preparar parâmetros a partir da pesquisa e de referências
identificadas, solicitar informações essenciais ausentes e conduzir cálculos por ferramentas
científicas. Os resultados e sua avaliação alimentam a comparação e a experiência 3D.

**Estado atual:** este repositório implementa um painel local do acervo NASA PSI, importação com
revisão, comparações, assistente por página e reconstruções 3D. Projetos de pesquisa independentes,
busca ativa na NASA, agente especializado de simulação e cálculo preditivo de novas condições
ainda não estão implementados. As seis investigações incluídas formam o acervo de demonstração
e referência.

A [visão do produto](docs/PRODUCT-VISION.md) apresenta a jornada de pesquisa e a ambição além da
demonstração atual. A [proposta de simulação](docs/SIMULATION.md) detalha a primeira experiência;
o [texto de apresentação ao Space Apps](docs/SUBMISSION.md) resume a visão e a demonstração em inglês.

## O problema

O pesquisador precisa relacionar seu experimento com evidências externas, entender semelhanças e
diferenças e investigar o que pode acontecer quando muda uma condição. A jornada deve preservar
a origem dos resultados e distinguir evidências, hipóteses e previsões.

O protótipo atual resolve uma parte desse problema com o acervo NASA: cada investigação publicou
os dados do seu jeito (uma aba por pesquisador, pares de colunas lado a lado, categorias em texto
livre, unidades no cabeçalho ou em lugar nenhum); medição e simulação ficam na mesma tabela;
parte das "medições" de um estudo são os
voos de outro; e as armadilhas de cada experimento (um `0` que quer dizer "não houve extinção", uma
leitura de painel que não é velocidade) estão nos relatórios, não nas tabelas. Um chat genérico de
IA responde com fluência sobre números que não existem.

## O que o protótipo atual faz

- **Seis investigações prontas para explorar**: FLEX (PSI-69), CFI (PSI-39), PSI-117, BASS-II
  (PSI-25), PSI-142 e BASS (PSI-26), cada uma com a pergunta que responde, a fonte, a completude, os
  alertas de qualidade e as cautelas ("o que não concluir").
- **Ficha de cada estudo**, calculada dos dados: combustíveis, amostras, condições na mesma unidade,
  o que se mediu, o que variou e o que ficou fixo, e as condições que variaram juntas. Com os
  documentos do estudo, a ficha ganha objetivo, sensores e condições fixas, com a página de origem.
- **Reconstrução 3D dos estudos suportados**: cenas WebGL2 reproduzem dados e trechos reconstruídos
  ou estimados, com notas sobre as hipóteses usadas. Ensaios sem entradas suficientes são bloqueados.
  Não há cálculo preditivo de gravidade/pressão alteradas nem geração automática de 3D para qualquer envio.
- **Comparações com regras**: PSI-117 × CFI com correspondência ponto a ponto (não é validação
  independente), e **Fichas lado a lado**, com veredito por par.
- **Assistente por página**, que só usa consultas prontas aos dados daquela página e mostra o custo
  de cada pergunta.
- **Envio de estudos novos**: exige identificação PSI, tabelas e documento; a IA propõe como ler
  as colunas, uma pessoa revisa e aprova, e o código passa a carregar o estudo no catálogo local.
  Ainda não cria um projeto de pesquisa independente.

A regra para adotar interpretações de dados é: **a IA propõe, o código valida e aplica, uma pessoa
revisa e aprova.** O assistente recebe instruções para fundamentar números nas ferramentas, mas seu
texto não possui verificação factual final. Medições, resultados de modelos e incertezas devem
permanecer distinguíveis; a página Explorar ainda tem uma limitação conhecida de agregação.

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

Estão no [README.md](README.md), em inglês. O rascunho de apresentação está em
[docs/SUBMISSION.md](docs/SUBMISSION.md). A documentação
técnica (arquitetura, dados, decisões, validação) está em [`docs/`](docs/README.md).

O protótipo mostra evidências e reconstrói experimentos registrados. A simulação de novas condições
é um objetivo que ainda exige seleção de modelo e avaliação científica. O produto não oferece
orientação operacional de segurança e não tem vínculo nem endosso da NASA.
