"""Shared attribute, quantity and fact-sheet vocabulary."""

# atributo → (seção, rótulo, unidade comum, tipo)
ATRIBUTOS = {
    "combustivel": ("combustivel", "Combustível ou material", None, "categoria"),
    "forma_amostra": ("amostra", "Formato da amostra", None, "categoria"),
    "tamanho_amostra": ("amostra", "Tamanho da amostra", "mm", "numero"),
    "tamanho_queimador": ("amostra", "Tamanho do queimador", "mm", "numero"),
    "suporte": ("amostra", "Suporte da amostra", None, "categoria"),
    "oxigenio": ("condicao", "Oxigênio", "fração molar", "numero"),
    "nitrogenio": ("condicao", "Nitrogênio", "fração molar", "numero"),
    "helio": ("condicao", "Hélio", "fração molar", "numero"),
    "diluente": ("condicao", "Diluente", None, "categoria"),
    "pressao": ("condicao", "Pressão", "atm", "numero"),
    "velocidade_fluxo": ("condicao", "Velocidade do fluxo", "cm/s", "numero"),
    "ventilacao": ("condicao", "Ventilação", None, "categoria"),
    "temperatura": ("condicao", "Temperatura", "K", "numero"),
    # gás ou agente usado para apagar a chama (ex.: N2 por bocal no BASS; CO2, He e SF6 no FLEX), com a
    # vazão e o bocal. Não é o diluente da atmosfera nem o queimador.
    "agente_extintor": ("condicao", "Agente extintor", None, "categoria"),
    "outra_condicao": ("condicao", "Outra condição", None, "categoria"),
    "medicao": ("medicao", "Medição", None, "numero"),
}
# grandeza medida → (rótulo, unidade comum ou None quando cada estudo mede de um jeito). É o que diz que
# dois estudos mediram a mesma coisa; a comparação numérica ainda exige a mesma unidade.
GRANDEZAS = {
    "diametro_extincao": ("Diâmetro de extinção", "mm"),
    "taxa_queima": ("Taxa de queima", "mm²/s"),
    "tempo_queima": ("Tempo de queima", "s"),
    "taxa_estiramento_extincao": ("Taxa de estiramento na extinção", "1/s"),
    "temperatura_chama": ("Temperatura da chama", "K"),
    "gases_queima": ("Gases consumidos ou produzidos", None),
    "emissao_chama": ("Emissão da chama (luz, radiação, quimiluminescência)", None),
    "desfecho": ("Desfecho do ensaio", None),
    "outra_medicao": ("Outra medição", None),
}
SECOES = {
    "combustivel": "Combustíveis",
    "amostra": "Amostras",
    "condicao": "Condições",
    "medicao": "Medições",
}

LIST_SEP = " | "
