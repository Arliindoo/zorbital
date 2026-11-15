"""Adicionar documentos a um estudo do sistema: a IA lê a ficha (sensores, condições fixas, objetivo),
o código confere os trechos e você aprova. Grava em dados/<PSI>/documentos/ e dados/<PSI>/ficha.json."""

import json
import shutil

import pandas as pd
import streamlit as st

from spaceapps import db, ui, ui_ficha
from spaceapps.assistant import provider
from spaceapps.ingest import build
from spaceapps.studies import documents, ficha_docs, staging

KEY = "documentos_atual"
DOC_TYPES = ["pdf", "md", "txt", "zip", "rar", "tar", "gz", "tgz", "bz2", "xz"]

ui.require_db()
st.title("Adicionar documentos")
st.caption(
    "Para um estudo que já está no sistema: envie os documentos (de preferência o DLD e o SRD do portal). "
    "A IA lê o que só está escrito neles: sensores, condições mantidas fixas e o objetivo. Cada item cita a "
    "página, o código confere o trecho e nada é gravado sem a sua revisão."
)

studies = db.query("SELECT id, nome FROM investigacoes")
names = dict(studies.iter_rows())
upload = None
if st.session_state.get(KEY):
    try:
        upload = staging.Upload.load(st.session_state[KEY])
    except FileNotFoundError:
        st.session_state.pop(KEY)

# --- 1. Receber ---------------------------------------------------------------------------------
if upload is None:
    with st.form("documentos"):
        ids = sorted(names, key=lambda i: int(i.split("-")[1]) if i.split("-")[-1].isdigit() else 10**6)
        psi = st.selectbox("Estudo", ids, format_func=lambda i: f"{i} · {names[i]}")
        files = st.file_uploader("Documentos", accept_multiple_files=True, type=DOC_TYPES)
        sent = st.form_submit_button("Receber documentos", type="primary", icon=":material/upload:")
    limit = f"{documents.MAX_CHARS_TOTAL:,}".replace(",", ".")
    st.caption(
        f"PDF, MD ou TXT, soltos ou compactados. A IA lê até {documents.MAX_PAGES_PER_PDF} páginas por PDF e "
        f"{limit} caracteres no total: dois documentos bastam."
    )
    if sent:
        try:
            received = staging.receive(
                psi, [(f.name, f.getvalue()) for f in files or []], require_table=False
            )
        except staging.UploadError as error:
            st.error(str(error), icon=":material/error:")
        else:
            st.session_state[KEY] = received.id
            st.rerun()
    st.stop()


def discard() -> None:
    shutil.rmtree(upload.folder, ignore_errors=True)
    for key in (KEY, f"ficha_doc_base:{upload.id}"):
        st.session_state.pop(key, None)


st.subheader(f"{upload.psi} · {names.get(upload.psi, '')}")
left, right = st.columns([4, 1])
left.caption(f"Envio {upload.id} · estado: **{upload.estado}**")
if upload.estado == "aprovado":
    right.button("Novo envio", icon=":material/add:", on_click=lambda: st.session_state.pop(KEY, None),
                 width="stretch")  # fmt: skip
else:
    right.button("Descartar", icon=":material/delete:", on_click=discard, width="stretch")
with st.expander(f"Documentos recebidos ({len(upload.of_type('documento'))})"):
    st.dataframe(pd.DataFrame([f.__dict__ for f in upload.arquivos]), hide_index=True, width="stretch",
                 column_config={"sha1": None, "tamanho": st.column_config.NumberColumn("Bytes")})  # fmt: skip
for warning in upload.avisos:
    st.warning(warning, icon=":material/warning:")
if upload.estado == "aprovado":
    page, params = ui.study_link(db.investigation(upload.psi))
    st.success("Ficha gravada e carregada.", icon=":material/check_circle:")
    st.page_link(page, label="Abrir o estudo", icon=":material/arrow_forward:", query_params=params)
    st.stop()

# --- 2. Analisar --------------------------------------------------------------------------------
proposal = ficha_docs.load_proposal(upload)
if proposal is None:
    _, summary = ficha_docs.build_context(upload)
    tokens = f"{summary['tokens_entrada_aprox']:,}".replace(",", ".")
    st.markdown(
        f"Vai para a IA: o texto de **{summary['documentos']} documento(s)** e o que os dados já dizem do "
        f"estudo, cerca de {tokens} tokens."
    )
    if summary["documentos_cortados"]:
        st.warning("Os documentos passam do limite e foram cortados: mande menos ou menores.")
    if st.button(f"Ler a ficha com {ficha_docs.model()} · ≈ {summary['custo_zyt_aprox']} ZYT", type="primary",
                 icon=":material/auto_awesome:"):  # fmt: skip
        with st.spinner("A IA está lendo os documentos…"):
            try:
                ficha_docs.propose(upload)
            except provider.ProviderError as error:
                st.error(str(error), icon=":material/error:")
                st.stop()
        st.rerun()
    st.stop()

# --- 3. Revisar e aprovar -----------------------------------------------------------------------
usage = proposal.uso or {}
st.caption(
    f"Proposta de {proposal.modelo} em {proposal.criada_em.replace('T', ' ')}"
    + (f" · {usage['custo_zyt']:g} ZYT" if usage.get("custo_zyt") is not None else "")
)
base_key = f"ficha_doc_base:{upload.id}"
draft = upload.folder / "ficha_em_revisao.json"
if base_key not in st.session_state:  # base fixa na sessão: as edições ficam nos widgets
    st.session_state[base_key] = json.loads(draft.read_text()) if draft.exists() else proposal.ficha
with st.container(border=True):
    sheet = ui_ficha.review(st.session_state[base_key], f"ficha_doc:{upload.id}")
draft.write_text(json.dumps(sheet, ensure_ascii=False, indent=2), encoding="utf-8")

problems = ficha_docs.validate(sheet)
if not ficha_docs.items(ficha_docs.accepted(sheet)):
    problems = ["A ficha está vazia: não há o que gravar.", *problems]
st.subheader("Conferência")
if problems:
    st.error(f"{len(problems)} ponto(s) impedem aprovar:", icon=":material/rule:")
    st.markdown("\n".join(f"- {ui.md_escape(p)}" for p in problems))
else:
    kept = len(ficha_docs.items(ficha_docs.accepted(sheet)))
    left_out = ficha_docs.pending(sheet)
    rest = f"; {left_out} desmarcado(s) fica(m) de fora." if left_out else "."
    st.success(f"Ficha pronta para gravar: {kept} item(ns){rest}", icon=":material/check:")
exists = (build.DADOS / upload.psi / ficha_docs.FICHA_FILE).exists()
replace = st.checkbox(f"Substituir dados/{upload.psi}/{ficha_docs.FICHA_FILE}", disabled=not exists)
if st.button("Aprovar e gravar", type="primary", disabled=bool(problems), icon=":material/verified:"):
    with st.spinner("Gravando em dados/, carregando o banco e atualizando a seed…"):
        try:
            ficha_docs.approve(upload, sheet, model=proposal.modelo, replace=replace)
        except staging.UploadError as error:
            st.error(str(error), icon=":material/error:")
            st.stop()
    st.session_state.pop(base_key, None)
    st.rerun()
