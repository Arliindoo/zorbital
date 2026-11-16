"""Dicionário de dados: o que cada coluna e cada categoria do banco significam.

É a fonte da ferramenta `dicionario`. Tudo aqui é definição deste projeto ou o rótulo da fonte;
nada é interpretação física nova. "Cabeçalho na fonte" é o texto exato da coluna original.
"""

from __future__ import annotations

# coluna: (descrição, unidade, cabeçalho na fonte)
COLUMNS: dict[str, dict[str, tuple[str, str | None, str | None]]] = {
    "flex_ensaios": {
        "teste_id": ("Número do ensaio no FLEX.", None, "FLEX Test #"),
        "identificador": ("Código do ensaio.", None, "FLEX Identifier"),
        "data": ("Data do ensaio.", None, "Test Date"),
        "hora_gmt": ("Hora do ensaio em GMT.", None, "Test GMT"),
        "combustivel": ("Combustível da gota.", None, "Fuel"),
        "pressao_mmhg": ("Pressão ambiente na câmara.", "mmHg (760 mmHg ≈ 1 atm)", "Ambient pressure; mmHg"),
        "oxigenio_fracao": (
            "Fração molar inicial de O2 no ambiente.",
            "fração 0–1",
            "O initial ambient composition; mole fraction",
        ),
        "nitrogenio_fracao": (
            "Fração molar inicial de N2.",
            "fração 0–1",
            "N initial ambient composition; mole fraction",
        ),
        "gas_co_rotulo_ambiguo_fracao": (
            "Fração molar de um gás cujo cabeçalho perdeu o subscrito na exportação. Pode ser CO2; "
            "não tratar como tal sem confirmar no relatório.",
            "fração 0–1",
            "CO initial ambient composition; mole fraction",
        ),  # fmt: skip
        "helio_fracao": (
            "Fração molar inicial de hélio.",
            "fração 0–1",
            "He initial ambient composition; mole fraction",
        ),
        "diametro_inicial_mm": ("Diâmetro inicial da gota.", "mm", "Droplet initial diameter; mm"),
        "diametro_extincao_visivel_mm": (
            "Diâmetro da gota quando a chama visível se apagou. Chama fria pode continuar invisível depois.",
            "mm",
            "Visible flame extinction diameter; mm",
        ),  # fmt: skip
        "taxa_queima_valor": (
            "Taxa de queima. A unidade do rótulo ('mm') precisa ser conferida.",
            "a conferir",
            "Burning rate; mm",
        ),
        "tempo_queima_s": ("Duração da queima.", "s", "Burn time; s"),
        "desfecho": ("Como o ensaio terminou, traduzido de Test end.", None, "Test end"),
        "desfecho_original": ("Desfecho como está na fonte.", None, "Test end"),
        "fonte_arquivo": ("Arquivo de dados/ de onde a linha veio.", None, None),
    },
    "bass_ensaios": {
        "teste_id": ("Código do teste; a letra é a inicial do pesquisador.", None, "Test no."),
        "pesquisador": ("Pesquisador principal (aba da planilha original).", None, "nome da aba"),
        "data": ("Data do teste.", None, "Actual Date"),
        "gmt_dia": ("Dia do ano em GMT.", "dia 1–366", "GMT 2014-"),
        "amostra_id": ("Número da amostra.", None, "Sample no."),
        "material_original": ("Descrição do material como foi digitada.", None, "Material"),
        "material_categoria": (
            "Material extraído do texto. 'Não escrito na fonte' quando o texto não nomeia o material.",
            None,
            None,
        ),
        "geometria": (
            "Forma da amostra extraída do texto: filme, placa, haste, tecido, seção esférica, vela.",
            None,
            None,
        ),
        "espessura_mm": ("Espessura extraída do texto (micron convertido para mm).", "mm", None),
        "largura_cm": ("Largura extraída do texto.", "cm", None),
        "diametro_mm": ("Diâmetro de hastes (polegadas convertidas) ou da seção esférica.", "mm", None),
        "cor": ("Transparente ou preta, quando o texto diz.", None, None),
        "faces_queimando": ("1 ou 2 faces, quando o texto diz '1 sided'/'2 sided'.", None, None),
        "restritor_fluxo": ("Configuração do restritor de fluxo.", "código", "Flow restrictor"),
        "ventilador_display": (
            "Leituras do painel do ventilador, com os ajustes feitos durante o teste. Não é velocidade calibrada.",
            "leitura de painel",
            "Fan display",
        ),  # fmt: skip
        "ventilador_display_unico": (
            "Mesmo valor, só quando a célula tinha um único número.",
            "leitura de painel",
            "Fan display",
        ),
        "ar_display": (
            "Leituras do painel de ar, com os ajustes do teste. Não é velocidade calibrada.",
            "leitura de painel",
            "Air display",
        ),
        "ar_display_unico": (
            "Mesmo valor, só quando a célula tinha um único número.",
            "leitura de painel",
            "Air display",
        ),
        "ajustes_durante_teste": ("Verdadeiro se ventilador ou ar mudaram durante o teste.", None, None),
        "ganho_radiometro": (
            "Ganho do radiômetro; sequências indicam troca durante o teste.",
            None,
            "Radiometer gain",
        ),
        "quadros_total": ("Total de quadros filmados.", "quadros", "total frames shot"),
        "o2_inicial_pct": ("O2 calibrado no início.", "% do volume", "calibrated initial O2 % by vol"),
        "o2_final_pct": ("O2 calibrado no fim.", "% do volume", "calibrated final O2 % by vol"),
        "co2_inicial_pct": ("CO2 no início.", "% do volume", "Initial CO2 % by vol"),
        "co2_final_pct": ("CO2 no fim.", "% do volume", "Final CO2 % by vol"),
        "co_inicial_ppm": ("CO no início.", "ppm", "Initial CO (ppm)"),
        "co_final_ppm": ("CO no fim.", "ppm", "Final CO (ppm)"),
        "delta_o2_pp": ("O2 final − inicial.", "pontos percentuais", None),
        "delta_co2_pp": (
            "CO2 final − inicial. Depende de duração e protocolo; não mede risco.",
            "pontos percentuais",
            None,
        ),
        "delta_co_ppm": ("CO final − inicial.", "ppm", None),
        "fonte_arquivo": ("Arquivo de dados/ de onde a linha veio.", None, None),
    },
    "psi117_extincao": {
        "tipo_chama": (
            "Chama quente (visível) ou chama fria (regime de baixa temperatura).",
            None,
            "HF / CF no cabeçalho",
        ),
        "serie": ("Medição, Modelo, Limite superior ou Limite inferior.", None, "EXPT / model / ErrorBar"),
        "natureza": (
            "MEDIDO, SIMULADO ou INCERTEZA. Nunca somar ou tirar média entre naturezas.",
            None,
            None,
        ),
        "pressao_atm": ("Pressão do ponto.", "atm", "P (atm)"),
        "diametro_extincao_mm": ("Diâmetro da gota na extinção.", "mm", "Dext_*"),
        "coluna_fonte": ("Coluna da tabela original de onde o ponto saiu.", None, None),
        "linha_fonte": ("Linha da tabela original.", None, None),
        "fonte_arquivo": ("Arquivo de dados/ de onde a linha veio.", None, None),
    },
    "v_psi117_comparacao": {
        "medido_mm": (
            "Diâmetro de extinção medido; média quando há mais de uma medição na pressão.",
            "mm",
            None,
        ),
        "n_medicoes": ("Quantas medições existem naquela pressão.", None, None),
        "modelo_mm": ("Diâmetro de extinção previsto pelo modelo.", "mm", None),
        "limite_inferior_mm": (
            "Limite inferior da faixa de incerteza informada (só chama fria).",
            "mm",
            "Dext_CF_ErrorBar-",
        ),
        "limite_superior_mm": (
            "Limite superior da faixa de incerteza informada (só chama fria).",
            "mm",
            "Dext_CF_ErrorBar+",
        ),
        "diferenca_mm": ("Modelo − medido. Positivo: o modelo prevê gota maior na extinção.", "mm", None),
        "modelo_na_faixa": (
            "Se o modelo cai dentro da faixa de incerteza. Vazio onde não há faixa.",
            None,
            None,
        ),
    },
    "cfi_ensaios": {
        "teste_id": (
            "Flex Number: numeração do ensaio no aparelho do FLEX (não é um ensaio do PSI-69).",
            None,
            "Flex Number",
        ),
        "pressao_atm": ("Pressão da câmara.", "atm", "Pressure (atm)"),
        "oxigenio_fracao": ("Fração molar de O2.", "fração 0–1", "Oxygen"),
        "nitrogenio_fracao": ("Fração molar de N2.", "fração 0–1", "Nitrogen"),
        "helio_fracao": ("Fração molar de hélio (diluente).", "fração 0–1", "Helium"),
        "diluente": ("Hélio quando há hélio na mistura; senão Nitrogênio.", None, None),
        "fibra": ("Gota presa numa fibra (Yes) ou livre (No).", None, "Fiber"),
        "combustivel": (
            "Combustível traduzido: n-dodecano, misturas com iso-dodecano ou farnesano.",
            None,
            "Fuel",
        ),
        "d0_mm": ("Diâmetro inicial da gota.", "mm", "D0 ( mm )"),
        "dext_quente_mm": ("Diâmetro da gota quando a chama quente se apagou.", "mm", "Dext, hot ( mm )"),
        "dext_fria_mm": (
            "Diâmetro na extinção da chama fria. Vazio quando a fonte diz 0 (sem extinção visível).",
            "mm",
            "Dext,cool ( mm )",
        ),
        "dext_fria_zero_na_fonte": (
            "A fonte registra 0: a chama fria consumiu a gota sem extinção visível.",
            None,
            "Dext,cool = 0",
        ),
        "dext_fria_extrapolado": (
            "O diâmetro de extinção da chama fria foi extrapolado, não medido.",
            None,
            "Extrap CF?",
        ),
        "k_quente_mm2_s": ("Taxa de queima na fase de chama quente.", "mm²/s", "khot ( mm^2/s )"),
        "k_fria_mm2_s": ("Taxa de queima na fase de chama fria.", "mm²/s", "kcool ( mm^2/s )"),
        "reignicoes": ("Quantas vezes a chama reacendeu.", None, "Reignitions"),
        "tempo_chama_quente": (
            "Duração da chama quente. A planilha não informa a unidade (provavelmente s).",
            "não informada",
            "HF Burn Time",
        ),
        "analise_completa": (
            "A equipe marcou a análise do ensaio como concluída.",
            None,
            "Completed Analysis?",
        ),
        "comentario": ("Comentário do operador sobre o ensaio.", None, "Comments"),
    },
    "psi117_extincao_1atm": {
        "combustivel": ("n-heptano (C7), n-decano (C10) ou n-dodecano (C12).", None, "C7 / C10 / C12"),
        "serie": ("Medição (Expt) ou Modelo (Sim).", None, "Expt / Sim"),
        "d0_mm": ("Diâmetro inicial da gota.", "mm", "Do"),
        "dext_quente_mm": (
            "Diâmetro de extinção da chama quente. 0 = sem extinção ou sem chama.",
            "mm",
            "Dext_HF",
        ),
        "dext_fria_mm": (
            "Diâmetro de extinção da chama fria. 0 = sem extinção visível ou sem chama fria.",
            "mm",
            "Dext_CF",
        ),
    },
    "psi117_series_modelo": {
        "cenario": ("Chama fria estável ou oscilatória (n-heptano, D0 0,5 mm, 1 atm).", None, None),
        "t_s": ("Tempo da simulação.", "s", "Time(sec)"),
        "diametro_mm": ("Diâmetro da gota.", "mm", "Diameter(mm)"),
        "k_mm2_s": ("Taxa de queima instantânea.", "mm²/s", "K(mm^2/sec)"),
        "t_max_k": ("Temperatura máxima no campo.", "K", "T_max(K)"),
        "d_d0_quadrado": ("(D/D0)²: fração da área inicial que resta.", None, "(D/Do)2"),
    },
    "psi142_pontos": {
        "conjunto_id": ("Número do conjunto (aba data ID N da planilha).", None, "data ID"),
        "serie": ("Curva dentro da figura: combustível (nC7…nC14), teor de ozônio ou condição.", None, None),
        "x": ("Valor no eixo x, na unidade de x_nome.", None, None),
        "y": ("Valor no eixo y, na unidade de y_nome.", None, None),
        "x_nome": ("Nome do eixo x como na fonte (ex.: Yf = fração mássica de combustível).", None, None),
        "y_nome": (
            "Nome do eixo y como na fonte (ex.: aCFE = taxa de estiramento na extinção da chama fria, 1/s).",
            None,
            None,
        ),
    },
    "v_extincao_c12_comparacao": {
        "cfi_mediana_mm": ("Mediana do diâmetro de extinção nos ensaios do CFI daquela pressão.", "mm", None),
        "cfi_com_valor": ("Ensaios do CFI com diâmetro de extinção registrado.", None, None),
        "cfi_sem_extincao_visivel": ("Ensaios do CFI em que a chama fria consumiu a gota.", None, None),
        "modelo_menos_cfi_mm": ("Modelo do PSI-117 menos a mediana do CFI.", "mm", None),
        "cfi_na_faixa_psi117": (
            "A mediana do CFI cai dentro da faixa de incerteza informada pelo PSI-117.",
            None,
            None,
        ),
    },
}

TERMS = {
    "Extinção": "FLEX: a chama visível se apagou antes de a gota acabar (Test end = Extinction).",
    "Queima completa": "FLEX: a gota queimou até o fim (Test end = Completion).",
    "Ruptura da gota": "FLEX: classificação 'Disruption' do fim do ensaio. Não significa explosão.",
    "Não escrito na fonte": (
        "BASS-II: o texto do material não diz qual é (ex.: '1/4\" clear rod'). Provavelmente PMMA, "
        "mas isso precisa ser confirmado no relatório."
    ),
    "faixa informada": "PSI-117: limites superior e inferior da incerteza da chama fria, como estão na fonte.",
    "MEDIDO": "PSI-117: valor experimental.",
    "SIMULADO": "PSI-117: valor do modelo numérico.",
    "INCERTEZA": "PSI-117: limite da barra de erro informada na fonte.",
    "amostra": "Recorte de linhas da investigação, não a tabela completa. A Visão geral diz o que é amostra.",
    "Flex Number": "Numeração dos ensaios no aparelho de gotas da ISS usado pelo FLEX e pelo CFI.",
    "contrafluxo": "PSI-142: dois jatos opostos (combustível e oxidante) formam uma chama plana entre eles.",
    "aCFE": "PSI-142: taxa de estiramento (1/s) em que a chama fria se extingue. aHFE: o mesmo para a chama quente.",
    "Yf": "PSI-142: fração mássica de combustível no jato de combustível.",
    "chama fria": "Regime de combustão de baixa temperatura (centenas de K), quase sem luz visível.",
}

ALERTS = {
    "valor_nao_numerico": "Texto numa coluna numérica (ex.: 'OR', '>500'). O número ficou vazio.",
    "valor_ausente": "Célula vazia na fonte.",
    "valor_negativo": "Concentração negativa; provável desvio do sensor.",
    "variacao_extrema": "O2 mudou mais de 5 pontos percentuais no teste.",
    "data_suspeita": "Ano diferente do da campanha, sem explicação no cabeçalho.",
    "data_x_gmt": "A data não bate com o dia do ano em GMT.",
    "medicao_repetida": "Mais de uma medição na mesma pressão.",
    "valor_zero": "Diâmetro zero; pode indicar ausência de chama fria naquela pressão.",
    "espacos_no_id": "Identificador com espaço extra na fonte; o espaço foi removido.",
    "sem_resultados": "Ensaio com condições, mas sem linha de resultados.",
    "pressao_divergente": "Abas da mesma planilha dão pressões diferentes para o ensaio.",
    "metadado_conflitante": "Duas fontes descrevem o mesmo conjunto de forma contraditória (ex.: com × sem ozônio).",
    "metadado_divergente": "Duas fontes descrevem o mesmo conjunto de formas diferentes.",
    "eixo_suspeito": "Série cujos valores de x parecem estar na coluna de y: colunas provavelmente trocadas.",
    "fracao_suspeita": "Valor fora de 0–1 numa coluna de fração molar.",
    "divergencia_entre_fontes": "O mesmo ensaio tem valores diferentes em duas investigações.",
}


def lookup(term: str, table: str | None = None) -> dict:
    """Procura um termo como coluna (na tabela dada ou em todas), categoria ou tipo de alerta."""
    key = term.strip()
    tables = [table] if table in COLUMNS else list(COLUMNS)
    for name in tables:
        if key in COLUMNS[name]:
            desc, unit, header = COLUMNS[name][key]
            return {"tipo": "coluna", "tabela": name, "coluna": key, "descricao": desc,
                    "unidade": unit, "cabecalho_na_fonte": header}  # fmt: skip
    for source in (TERMS, ALERTS):
        for name, desc in source.items():
            if name.lower() == key.lower():
                return {
                    "tipo": "categoria" if source is TERMS else "alerta",
                    "termo": name,
                    "descricao": desc,
                }
    return {
        "erro": f"'{term}' não está no dicionário.",
        "termos_disponiveis": sorted({*TERMS, *ALERTS, *(c for t in tables for c in COLUMNS[t])}),
    }
