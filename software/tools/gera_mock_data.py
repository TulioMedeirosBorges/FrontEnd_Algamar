"""Gera software/js/mock-data.js (dados de teste do login admin/admin).

Precisa da API local do ML rodando (python dashboard_local.py, porta 3000).
Uso, na raiz do repositório:  python software/tools/gera_mock_data.py software/js/mock-data.js
"""
import json, sys, urllib.request, urllib.parse
BASE = "http://localhost:3000/api"
def get(path, **params):
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(f"{BASE}{path}?{q}", headers={"Authorization": "Bearer demo-mode"})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    assert d.get("success"), (path, params, d)
    return d
REGIOES = ["", "Litoral Norte", "Baixada Santista", "Litoral Sul"]
mock = {
    "coastalRisks": {r: get("/ml/coastal-risks", region=r or None, meses=3) for r in REGIOES},
    "condicoesAmbientais": {r: get("/ml/condicoes-ambientais", region=r or None, meses=3) for r in REGIOES},
    "condicoesPropicias": get("/ml/condicoes-propicias"),
    "condicoesHistorico": get("/ml/condicoes-propicias/historico", meses=12),
}
out = sys.argv[1]
with open(out, "w", encoding="utf-8") as f:
    f.write("// GERADO — dados de teste de interface para o login local admin/admin.\n")
    f.write("// Foto das respostas da API local do ML (dashboard_local.py). Só é carregado\n")
    f.write("// pelo api-client.js quando a sessão é a de desenvolvimento (DEV_TOKEN).\n")
    f.write("window.ALGAMAR_MOCK = ")
    json.dump(mock, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("ok")
