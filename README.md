# Algamar — Frontend

Frontend do **Algamar**, software de previsão de floração de algas tóxicas no
litoral. É HTML, CSS e JavaScript puros: não tem framework, build nem
dependências npm. A única coisa externa são as fontes do Google Fonts.

O projeto tem duas partes independentes e uma base comum:

| Parte        | O que é                                         | Precisa de login/API? |
|--------------|-------------------------------------------------|-----------------------|
| `site/`      | Site institucional público                      | Não                   |
| `software/`  | Sistema logado (dashboard, mapa, previsões etc.)| Sim                   |
| `shared/`    | Tokens de design, reset e logos usados pelos dois | —                   |

## Estrutura

```
index.html            redireciona para site/index.html

shared/
  css/base.css          tokens de design (cores, fontes, espaçamentos) + reset
  assets/               LogoBranca.png, LogoEscura.png

site/                 SITE institucional
  index.html            página inicial (hero, litoral, impactos)
  pages/                o-que-preve.html, como-funciona.html
  css/                  main.css + um CSS por página
  js/                   main.js (barra de progresso, animações) + um JS por página
  assets/               ícones, fotos e ilustrações

software/             SOFTWARE (sistema logado)
  pages/                login, criar-conta, dashboard, mapa-interativo,
                        previsoes, historico-ocorrencias, alertas,
                        dados-ambientais, relatorios, configuracoes
  css/                  dashboard.css (todas as telas internas), login.css
  js/
    api-config.js         endereço da API — o único lugar com a URL
    api-client.js         fetch autenticado + sessão (token no localStorage)
    dash-shell.js         sidebar, topo, checagem de sessão, aviso de API fora
    notifications.js      menu do sino (prévia das notificações)
    user-prefs.js         foto e preferências guardadas no navegador
    pdf-lite.js           gerador de PDF dos relatórios (sem bibliotecas)
    dashboard.js, dashboard-map.js
    previsoes.js, historico.js, alertas.js, dados-ambientais.js,
    relatorios.js, configuracoes.js, login.js, criar-conta.js
  assets/               ícones, níveis de floração, imagens de satélite
```

## Como as partes se ligam

- O botão **Acessar Software** do site leva para `software/pages/login.html`.
- O logo das telas de login, cadastro e dashboard volta para `site/index.html`.
- O site não depende de nada de `software/`. O software só usa do site o logo
  e o link "Saiba mais" do dashboard.
- Toda página carrega `shared/css/base.css` antes do CSS da sua parte.

## Rodando localmente

1. Abra a pasta no VS Code e inicie o **Live Server** (porta 5501).
2. Acesse a raiz: ela redireciona para o site.
3. Para usar o software, a API do backend precisa estar no ar no endereço
   definido em `software/js/api-config.js`.

### Endereço da API

Troque só a constante `window.ALGAMAR_API_BASE` em `software/js/api-config.js`.
O arquivo já tem as três opções comentadas:

- local: `http://localhost:3000/api`
- rede Tailscale: `http://100.109.64.40:3000/api` (a que está ativa)
- Cloudflare Quick Tunnel: a URL muda a cada reinício do túnel

## Rotas da API usadas

| Método | Rota                | Uso                                              |
|--------|---------------------|--------------------------------------------------|
| POST   | `/auth/register`    | Criar conta                                      |
| POST   | `/auth/login`       | Login (devolve o JWT)                            |
| PUT    | `/auth/me`          | Alterar nome, e-mail ou senha                    |
| DELETE | `/auth/me`          | Excluir a conta                                  |
| GET    | `/health`           | Ver se a API e o banco estão no ar               |
| GET    | `/ml/coastal-risks` | Mapa, riscos, indicadores e tendências (filtros `?region=&risk_level=&month=`) |

As rotas autenticadas mandam o token como `Bearer`. `/predict`,
`/marine-data` e `/predictions` são internas do backend e o frontend não as
chama.

## Dados e limitações

- Todas as telas internas são montadas a partir de `/ml/coastal-risks`.
  Alertas e notificações saem dos registros região/mês já ocorridos, com a
  severidade tirada da probabilidade (ou do `risk_level`).
- Campos que a API ainda não fornece (tipo de alga, concentração, vento,
  correntes, pH, precipitação, clima) aparecem como "—".
- Foto de perfil, preferências e configurações de notificação ficam só **neste
  navegador** (`user-prefs.js`). O envio real de notificações (e-mail/push)
  ainda não existe.
- Se a API estiver fora do ar, as telas mostram um aviso em vez dos dados.
