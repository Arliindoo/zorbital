"""Enviar estudo: upload → análise pela IA → revisão humana → aprovação."""

import json
import shutil

import pandas as pd
import streamlit as st

from spaceapps import ui, ui_ficha
from spaceapps.assistant import provider
from spaceapps.ingest import ficha, generic
from spaceapps.studies import approve, documents, ficha_docs, propose, staging

KEY = "envio_atual"
UPLOAD_TYPES = [
    "csv",
    "xlsx",
    "xlsm",
    "xls",
    "pdf",
    "md",
    "txt",
    "zip",
    "rar",
    "tar",
    "gz",
    "tgz",
    "bz2",
    "xz",
]

st.title("Enviar estudo")
st.caption(
    "Envie as tabelas e o documento do estudo (relatório, artigo ou ReadMe), soltos ou em .zip, .rar ou .tar.gz. "
    "A IA propõe como ler cada coluna; nada é gravado sem a sua revisão."
)

upload = None
if st.session_state.get(KEY):
    try:
        upload = staging.Upload.load(st.session_state[KEY])
    except FileNotFoundError:
        st.session_state.pop(KEY)

# --- 1. Receber ---------------------------------------------------------------------------------
if upload is None:
    with st.form("envio"):
        psi = st.text_input("Número do PSI", placeholder="PSI-26")
        files = st.file_uploader("Arquivos", accept_multiple_files=True, type=UPLOAD_TYPES)
        sent = st.form_submit_button("Receber arquivos", type="primary", icon=":material/upload:")
    st.caption("Obrigatório: ao menos uma tabela (.csv, .xlsx) e um documento (.pdf, .md ou .txt).")
    if sent:
        try:
            received = staging.receive(psi, [(f.name, f.getvalue()) for f in files or []])
        except staging.UploadError as error:
            st.error(str(error), icon=":material/error:")
        else:
            st.session_state[KEY] = received.id
            st.rerun()
    st.stop()


def attribute_label(key: str) -> str:
    if not key:
        return "—"
    _, label, unit, _ = ficha.ATRIBUTOS[key]
    return f"{label} ({unit})" if unit else label


def quantity_label(key: str) -> str:
    if not key:
        return "—"
    label, unit = ficha.GRANDEZAS[key]
    return f"{label} ({unit})" if unit else label


def discard() -> None:
    shutil.rmtree(upload.folder, ignore_errors=True)
    st.session_state.pop(KEY, None)
    st.session_state.pop(f"spec:{upload.id}", None)
    st.session_state.pop(f"ficha_base:{upload.id}", None)


st.subheader(f"{upload.psi} · envio {upload.id}")
cols = st.columns([4, 1])
cols[0].caption(f"Recebido em {upload.criado_em.replace('T', ' ')} · estado: **{upload.estado}**")
if upload.estado != "aprovado":
    cols[1].button("Descartar envio", icon=":material/delete:", on_click=discard, width="stretch")
else:
    cols[1].button(
        "Novo envio", icon=":material/add:", on_click=lambda: st.session_state.pop(KEY, None), width="stretch"
    )

with st.expander(f"Arquivos recebidos ({len(upload.arquivos)})", expanded=upload.estado == "recebido"):
    st.dataframe(
        pd.DataFrame([f.__dict__ for f in upload.arquivos]),
        hide_index=True,
        width="stretch",
        column_config={"sha1": None, "tamanho": st.column_config.NumberColumn("Bytes")},
    )
for warning in upload.avisos:
    st.warning(warning, icon=":material/warning:")

if upload.estado == "aprovado":
    st.success(f"{upload.psi} foi aprovado e já está no sistema.", icon=":material/check_circle:")
    st.page_link(
        "views/estudos.py",
        label="Abrir o estudo",
        icon=":material/arrow_forward:",
        query_params={"estudo": upload.psi},
    )
    st.stop()

# --- 2. Analisar --------------------------------------------------------------------------------
proposal = propose.load_proposal(upload)
if proposal is None:
    st.subheader("Análise pela IA")
    context, summary = propose.build_context(upload)
    tokens = f"{summary['tokens_entrada_aprox']:,}".replace(",", ".")
    st.markdown(
        f"Vai para a IA: o perfil de **{summary['abas']} aba(s)** e o texto de "
        f"**{summary['documentos']} documento(s)** (não as planilhas inteiras), cerca de {tokens} tokens."
    )
    if summary["documentos_cortados"]:
        st.warning(
            f"Os documentos passam de {documents.MAX_CHARS_TOTAL:,} caracteres e foram cortados.".replace(
                ",", "."
            )
        )
    if st.button(
        f"Analisar com {propose.model()} · ≈ {summary['custo_zyt_aprox']} ZYT",
        type="primary",
        icon=":material/auto_awesome:",
    ):
        with st.spinner("A IA está lendo o perfil das tabelas e os documentos…"):
            try:
                propose.propose(upload)
            except provider.ProviderError as error:
                st.error(str(error), icon=":material/error:")
                st.stop()
        st.rerun()
    st.stop()

# --- 3. Revisar ---------------------------------------------------------------------------------
spec_key = f"spec:{upload.id}"
edited_path = upload.folder / "especificacao_em_revisao.json"
if spec_key not in st.session_state:
    source = edited_path if edited_path.exists() else None
    st.session_state[spec_key] = json.loads(source.read_text()) if source else proposal.especificacao
spec = st.session_state[spec_key]


def persist() -> None:
    edited_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")


usage = proposal.uso or {}
st.subheader("Revisão")
st.caption(
    f"Proposta de {proposal.modelo} em {proposal.criada_em.replace('T', ' ')} · {proposal.tentativas} tentativa(s)"
    + (f" · {usage['custo_zyt']:g} ZYT" if usage.get("custo_zyt") is not None else "")
    + ". Confira cada interpretação: as marcadas **inferido** precisam da sua confirmação."
)

inv = spec["investigacao"]
with st.container(border=True):
    st.markdown("**Investigação**")
    left, right = st.columns(2)
    inv["nome"] = left.text_input("Nome", inv.get("nome", ""))
    inv["categoria"] = right.text_input("Categoria", inv.get("categoria", ""))
    inv["ambiente"] = left.text_input("Ambiente", inv.get("ambiente", ""))
    inv["tipo_evidencia"] = right.text_input("Tipo de evidência", inv.get("tipo_evidencia", ""))
    inv["pergunta"] = st.text_input("Pergunta que estes dados respondem", inv.get("pergunta", ""))
    cautions = pd.DataFrame(
        [
            {"texto": c.get("texto", ""), "evidencia": ui.evidence_label(c.get("evidencia"))}
            for c in inv.get("cautelas", [])
        ]
        or [{"texto": "", "evidencia": ""}]
    )
    edited = st.data_editor(
        cautions,
        num_rows="dynamic",
        hide_index=True,
        width="stretch",
        key=f"cautelas:{upload.id}",
        column_config={
            "texto": st.column_config.TextColumn("Cautela (o que não concluir)", width="large"),
            "evidencia": st.column_config.TextColumn("Fonte", disabled=True),
        },
    )
    old = inv.get("cautelas", [])
    inv["cautelas"] = [
        {"texto": t, "evidencia": old[i]["evidencia"] if i < len(old) else {"tipo": "inferido"}}
        for i, t in enumerate(edited["texto"].fillna("").tolist())
        if str(t).strip()
    ]

if spec.get("lacunas"):
    with st.container(border=True):
        st.markdown(":material/help: **O que os documentos não responderam**")
        st.markdown("\n".join(f"- {gap}" for gap in spec["lacunas"]))

for t_index, table in enumerate(spec["tabelas"]):
    with st.container(border=True):
        st.markdown(f"**Tabela `{table['nome']}`** · layout {table['layout']}")
        st.caption(table.get("descricao", ""))
        sources = pd.DataFrame(
            [
                {
                    "arquivo": s["arquivo"],
                    "aba": s.get("aba"),
                    "linha_cabecalho": s["linha_cabecalho"],
                    "rotulo": s.get("rotulo"),
                }
                for s in table["fontes"]
            ]
        )
        edited_sources = st.data_editor(
            sources,
            hide_index=True,
            width="stretch",
            key=f"fontes:{upload.id}:{t_index}",
            column_config={
                "arquivo": st.column_config.TextColumn("Arquivo", disabled=True),
                "aba": st.column_config.TextColumn("Aba", disabled=True),
                "linha_cabecalho": st.column_config.NumberColumn("Linha do cabeçalho", min_value=1, step=1),
                "rotulo": st.column_config.TextColumn("Rótulo (empilhado)"),
            },
        )
        for s, row in zip(table["fontes"], edited_sources.to_dict("records"), strict=True):
            s["linha_cabecalho"] = int(row["linha_cabecalho"])
            s["rotulo"] = row.get("rotulo") or None
        pending = [c["origem"] for c in table["colunas"]
                   if c["natureza"] != "IGNORAR" and not c.get("confirmado")]  # fmt: skip
        if pending:
            st.warning("Aguardam a sua confirmação (inferidas pela IA, sem fonte escrita): "
                       + ", ".join(f"**{p}**" for p in pending), icon=":material/fact_check:")  # fmt: skip
        # o que a pessoa precisa conferir vem primeiro: de onde saiu a leitura, e se ela confirma
        columns = pd.DataFrame(
            [
                {
                    "origem": c["origem"],
                    "confirmado": bool(c.get("confirmado")),
                    "evidencia": ui.evidence_label(c.get("evidencia")),
                    "destino": c.get("destino", ""),
                    "natureza": c["natureza"],
                    "atributo": c.get("atributo") or "",
                    "grandeza": c.get("grandeza") or "",
                    "tipo": c.get("tipo", "texto"),
                    "unidade": c.get("unidade") or "",
                    "descricao": c.get("descricao", ""),
                    "especiais": "; ".join(
                        f"{v['valor']} → {v['significado']}" for v in c.get("valores_especiais") or []
                    ),
                }
                for c in table["colunas"]
            ]
        )
        edited_columns = st.data_editor(
            columns,
            hide_index=True,
            width="stretch",
            key=f"colunas:{upload.id}:{t_index}",
            column_config={
                "origem": st.column_config.TextColumn("Cabeçalho na fonte", disabled=True),
                "destino": st.column_config.TextColumn("Nome no banco"),
                "natureza": st.column_config.SelectboxColumn(
                    "Natureza", options=list(generic.NATUREZAS), required=True
                ),
                "atributo": st.column_config.SelectboxColumn(
                    "Atributo (ficha)",
                    options=["", *ficha.ATRIBUTOS],
                    format_func=attribute_label,
                    help="O que a condição representa na ficha do estudo (O2, pressão, combustível…). "
                    "Vazio para identificadores e medições.",
                ),  # fmt: skip
                "grandeza": st.column_config.SelectboxColumn(
                    "Grandeza (medição)",
                    options=["", *ficha.GRANDEZAS],
                    format_func=quantity_label,
                    help="O que a coluna mede, para comparar estudos. Vazio nas condições e identificadores.",
                ),  # fmt: skip
                "tipo": st.column_config.SelectboxColumn("Tipo", options=list(generic.TIPOS), required=True),
                "unidade": st.column_config.TextColumn("Unidade"),
                "descricao": st.column_config.TextColumn("Descrição", width="large"),
                "evidencia": st.column_config.TextColumn("De onde saiu", disabled=True, width="medium"),
                "especiais": st.column_config.TextColumn("Valores especiais", disabled=True),
                "confirmado": st.column_config.CheckboxColumn("Confirmado"),
            },
        )
        for c, row in zip(table["colunas"], edited_columns.to_dict("records"), strict=True):
            for field in ("destino", "natureza", "tipo", "descricao"):
                c[field] = row[field]
            c["unidade"] = row["unidade"] or None
            c["atributo"] = row["atributo"] or None
            c["grandeza"] = row["grandeza"] or None
            c["confirmado"] = bool(row["confirmado"])
        for exclusion in table.get("excluir_linhas") or []:
            st.caption(
                f":material/filter_alt_off: Linhas excluídas onde `{exclusion['coluna']}` = "
                f"{', '.join(map(str, exclusion['valores']))}: {exclusion['motivo']}"
            )

with st.container(border=True):
    st.markdown("**Ficha do estudo (dos documentos)**")
    base_key = f"ficha_base:{upload.id}"
    if base_key not in st.session_state:  # base fixa na sessão: as edições ficam nos widgets
        st.session_state[base_key] = json.loads(json.dumps(spec.get("ficha") or {}))
    if ficha_docs.items(st.session_state[base_key]):
        spec["ficha"] = ui_ficha.review(st.session_state[base_key], f"ficha:{upload.id}")
    else:
        st.caption("A IA não encontrou nos documentos nada além do que as tabelas já mostram.")
persist()

if spec.get("comparacoes_sugeridas"):
    with st.expander(
        f"Comparações sugeridas pela IA ({len(spec['comparacoes_sugeridas'])})",
        icon=":material/compare_arrows:",
    ):
        st.caption(
            "Ficam gravadas com o estudo. A comparação automática, com regras de compatibilidade, é a próxima fase."
        )
        st.dataframe(pd.DataFrame(spec["comparacoes_sugeridas"]), hide_index=True, width="stretch")

# --- Conferência e aprovação --------------------------------------------------------------------
problems = generic.validate(spec, upload.files_dir)
st.subheader("Conferência")
if problems:
    st.error(f"{len(problems)} ponto(s) impedem aprovar:", icon=":material/rule:")
    st.markdown("\n".join(f"- {p}" for p in problems))
else:
    st.success("Especificação válida.", icon=":material/check:")

blocking = [p for p in problems if "não encontrad" in p or "não existe" in p or "linha_cabecalho" in p]
try:
    if blocking:  # sem os arquivos ou o cabeçalho certos, não há o que pré-visualizar
        raise generic.SpecError("corrija primeiro os pontos de arquivo, aba ou cabeçalho acima.")
    tables, alerts, _ = generic.apply(spec, upload.files_dir)
except (generic.SpecError, KeyError, ValueError, TypeError, OSError) as error:
    st.warning(f"Prévia indisponível: {error}")
else:
    for name, frame in tables.items():
        with st.expander(f"Prévia de `{name}` ({frame.height} linhas)", expanded=not problems):
            st.dataframe(frame.head(50), hide_index=True, width="stretch")
    if alerts.height:
        with st.expander(f"Alertas que a leitura vai registrar ({alerts.height})", icon=":material/rule:"):
            st.dataframe(alerts.group_by("tipo").len("ocorrencias"), hide_index=True)
            st.dataframe(alerts.drop("investigacao"), hide_index=True, width="stretch")

replace = st.checkbox(f"Substituir dados/{upload.psi}/ se já existir")
if st.button(
    "Aprovar e gravar no sistema", type="primary", disabled=bool(problems), icon=":material/verified:"
):
    with st.spinner("Gravando em dados/, carregando o banco e atualizando a seed…"):
        try:
            counts = approve.approve(upload, spec, model=proposal.modelo, replace=replace)
        except staging.UploadError as error:
            st.error(str(error), icon=":material/error:")
            st.stop()
    st.session_state.pop(spec_key, None)
    made = [n for n in counts if n.startswith(upload.psi.lower().replace("-", ""))]
    st.success(
        f"{upload.psi} gravado: " + ", ".join(f"{n} ({counts[n]} linhas)" for n in made),
        icon=":material/check_circle:",
    )
    st.rerun()
