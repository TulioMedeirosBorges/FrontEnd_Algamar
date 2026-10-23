// Configuração central da API do backend Algamar.
// Troque APENAS esta constante quando o back-end mudar de endereço —
// nenhum outro arquivo do front-end deve ter URLs da API embutidas.
//
// Desenvolvimento local (front-end e back-end na mesma máquina):
// (teste local com o ML: no projeto do ML, rode `python dashboard_local.py`)
window.ALGAMAR_API_BASE = "http://localhost:3000/api";

// Back-end na rede (Tailscale):
// window.ALGAMAR_API_BASE = "http://100.109.64.40:3000/api";

// Acesso remoto (back-end exposto via Cloudflare Quick Tunnel).
// A URL muda toda vez que o túnel é reiniciado — atualize aqui quando isso acontecer:
// window.ALGAMAR_API_BASE = "https://SUBSTITUA-PELA-URL-ATUAL.trycloudflare.com/api";

// Rotas consumidas pelo front (todas relativas a ALGAMAR_API_BASE):
//   POST   /auth/register     criar usuário
//   POST   /auth/login        autenticar e obter o JWT
//   PUT    /auth/me           atualizar nome, e-mail ou senha (Bearer)
//   DELETE /auth/me           excluir a conta autenticada (Bearer)
//   GET    /health            disponibilidade da API e do banco
//   GET    /ml/coastal-risks  mapa, riscos, indicadores e tendências (Bearer)
//                             filtros: ?region=&risk_level=&month=
// /predict, /marine-data e /predictions são internas do backend: não chamar.

window.ALGAMAR_TOKEN_KEY = "algamar_token";
window.ALGAMAR_USER_KEY = "algamar_user";
