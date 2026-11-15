"""Envio de estudos: upload, leitura assistida por IA, revisão humana e gravação no sistema.

Fluxo: `staging` (recebe e descompacta) → `profile` e `documents` (descrevem o que chegou, sem IA) →
`propose` (a IA propõe a especificação de leitura) → revisão na tela → `approve` (grava em `dados/` e
roda a carga). A IA nunca grava dados: ela propõe uma especificação, e quem lê as tabelas é código
determinístico (`ingest/generic.py`), que roda igual em toda carga.
"""
