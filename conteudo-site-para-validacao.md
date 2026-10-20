# Algamar — conteúdo do site para validação

Este documento traz **todo o texto visível** do site institucional da Algamar (pasta `site/`), página por página, na ordem em que aparece na tela.

**Como usar:**

- O texto está transcrito **exatamente como está no site**, inclusive erros de digitação. Não corrigi nada, para que vocês validem o que está publicado de fato.
- Ao fim de cada seção há uma caixa **"Validado"**. Marquem-na ou anotem a correção logo abaixo.
- Na seção final, **"Pontos de atenção"**, listei o que já parece precisar de revisão: textos provisórios, números simulados e possíveis erros.
- Botões, menus e textos de navegação estão marcados como *(botão)* ou *(menu)*. Textos alternativos de imagem estão marcados como *(texto alternativo da imagem)*, porque leitores de tela também os leem.

---

## Elementos comuns a todas as páginas

### Menu do topo

*(menu)* Página inicial · O que prevê · Como funciona

*(botão)* Acessar Software

### Rodapé

> Grupo de pesquisa em previsão de florações de algas nocivas no litoral de São Paulo.
> Os resultados de pesquisa apresentados nesta página são uma simulação para fins de demonstração.
> Em caso de suspeita de contaminação, procure a vigilância sanitária local.

- [ ] Validado — observações:

---

# Página 1 — Página inicial

**Título da aba do navegador:** Algamar — Software de previsibilidade de algas tóxicas

## 1.1 Abertura

**Etiqueta:** Projeto Algamar 2026

**Título:**
> Conheça a Algamar.
> Software de previsibilidade
> de algas tóxicas.

*(botão)* Acessar Software

*(texto alternativo da imagem)* Ilustração geométrica decorativa

- [ ] Validado — observações:

## 1.2 Uma nova forma de observar o litoral

**Etiqueta:** Algamar

**Título:** Uma nova forma de observar o litoral.

> Nosso objetivo é transformar dados ambientais em informações útil para antecipar eventos de floração e apoiar decisões importantes para o litoral de São Paulo.

*(botão)* Saiba como funciona

**Camadas de dados** (lista que abre ao clicar em cada item):

**Condições atmosféricas**
> Dados de temperatura, chuva, vento e radiação solar serão cruzados com registros de ocorrências para identificar padrões e possíveis condições de risco para florações de algas tóxicas no litoral paulista.

**Oceanografia**
> Dados oceanográficos, como correntes, temperatura e salinidade, serão analisados para compreender as condições do mar e sua relação com a formação e dispersão das algas.

**Qualidade da água**
> Informações sobre nutrientes, turbidez, oxigênio e outros indicadores serão utilizadas para avaliar a qualidade da água e identificar condições favoráveis à proliferação de algas.

**Modelo preditivo**
> O sistema combinará dados ambientais e históricos para identificar padrões e estimar a possibilidade de ocorrência de florações de algas tóxicas.

**Risco de floração**
> A partir dos dados analisados, o sistema indicará áreas com diferentes níveis de risco, auxiliando no monitoramento e na identificação antecipada de possíveis florações.

*(texto alternativo da imagem)* Diagrama isométrico das camadas de dados analisadas pela Algamar

- [ ] Validado — observações:

## 1.3 O problema

**Etiqueta:** O problema

**Título:** Por que nos preocupar ?

> As florações de alga podem alterar o equilíbrio dos ambientes aquáticos, afetar atividades económicas e, em alguns casos, estar associadas á produção de toxinas que representam riscos á saúde humana e animal.

**Cartões** (carrossel com 3 cartões; cada um tem o botão *Ler mais*, que hoje não leva a lugar nenhum):

**Impacto ambiental**
> Texto a definir.

*(texto alternativo da imagem)* Vista aérea do litoral mostrando o impacto ambiental das florações de algas

**Impactos econômicos**
> As florações de algas tóxicas podem causar prejuízos à pesca, ao turismo e à aquicultura. A morte de peixes e a contaminação da água reduzem a atividade pesqueira, enquanto praias interditadas podem afastar turistas e prejudicar negócios locais.

*(texto alternativo da imagem)* Porto e embarcações representando os impactos econômicos das florações de algas

**Riscos á saúde**
> Texto a definir.

*(texto alternativo da imagem)* Placa de aviso em praia interditada, representando riscos à saúde

*(botões do carrossel)* Anterior · Próximo

- [ ] Validado — observações:

## 1.4 A pesquisa

**Etiqueta:** A pesquisa

**Título:**
> Testamos se dava para prever.
> Dava.

> O estudo piloto que originou a **ALGAMAR** comparou o risco calculado pelo modelo com as florações efetivamente registradas no litoral paulista, ao longo de um ciclo sazonal completo.

**Quadro "Desenho do estudo":**

| Campo | Texto no site |
|---|---|
| Titulo | Previsão de curto prazo de florações de algas nocivas por integração de dados orbitais e oceanográficos no litoral de São Paulo |
| Área | Litoral Norte, Baixada Santista e Complexo estuarino de Iguape-Cananéia |
| Periodo | 12 meses de campo · 8 anos de série histórica para treino |
| Dados | Clorofila-a e temperatura de superfície diárias, cruzadas com registros de ocorrência e balneabilidade |
| Método | Modelo de classificação treinado na série histórica, com projeção de transporte por correntes costeiras |
| Validação | Comparação semanal entre risco previsto e floração observada |

**Gráfico:** Risco previsto × floração observada · 24 semanas

- Eixo vertical: 0 · 50 · 100
- Legenda: Risco previsto pelo modelo · Floração observada em campo

**Números em destaque:**

| Valor | Rótulo |
|---|---|
| 82% | Acerto na detecção |
| 4,3 | Dias de antecedência |
| 9% | Falsos negativos |

**Nota abaixo dos números:**
> Resultado de simulação. Os números e o gráfico ilustram o desenho da pesquisa e devem ser trocados pelos dados reais quando o estudo de campo terminar.

- [ ] Validado — observações:

## 1.5 Sobre nós

**Etiqueta:** Sobre nós

**Título:** Quem está por trás do Algamar.

> Somos um grupo de estudantes de Análise e Desenvolvimento de Sistemas, e este software foi desenvolvido como parte de um projeto universitário. A iniciativa surgiu a partir de uma proposta do professor, que nos incentivou a desenvolver um projeto inovador, fora do cotidiano acadêmico, explorando a criação de um software com caráter preditivo e aplicação prática.

**Equipe:**

| Nome | Função | Descrição |
|---|---|---|
| Tulio Medeiros | Frontend Developer & UX/UI Designer | UX, fluxos de navegação e prototipação, Desenvolvimento do frontend e interfaces |
| Gabriela Hipólito | Pesquisadora / Documentação | Documentação técnica, científica e institucional, Artigo científico e relatórios |
| Igor Henrique | Software Architects, Machine Learning | Arquitetura, infraestrutura, implantação e versões, Mecanismo preditivo e Machine Learning |
| João Victor | Backend Developer / Data Analyst | Coleta, tratamento e análise de dados, Banco de dados e governança, Backend, serviços, APIs e integrações |
| João Francisco | Software Architects, Machine Learning | Arquitetura, infraestrutura, implantação e versões, Mecanismo preditivo e Machine Learning |
| Tailaine Pereira | QA & Security Analyst / Product Analyst | Levantamento e validação de requisitos, Testes, segurança e qualidade |
| Joicy Nunes | Gestão de Projetos / Pesquisadora | Gestão, planejamento, acompanhamento e integração Levantamento bibliográfico e fundamentação teórica |

- [ ] Validado — observações:

---

# Página 2 — O que prevê

**Título da aba do navegador:** Algamar — O que prevê

Na lateral da página há um indicador de progresso que mostra a seção atual: Início · A cadeia · O achado · As escalas · As fases · Os limiares · Outras previsões · A previsão · A base.

## 2.1 Abertura

**Etiqueta:** O que o sistema prevê

**Título:** Não é a mancha. É a semana antes dela.

> O ALGAMAR não tenta enxergar a floração que já está na superfície. Ele calcula a probabilidade de ela se formar, projeta para onde vai ser transportada e antecipa quando os moluscos vão ultrapassar o limite legal de toxina — cada uma dessas três coisas com um gatilho próprio.

- [ ] Validado — observações:

## 2.2 A cadeia da previsão

**Etiqueta:** A cadeia da previsão

**Título:** Três perguntas, em ordem.

> Cada bloco só faz sentido depois que o anterior respondeu. É o que separa a previsão de um simples painel de monitoramento.

**Pergunta 01 — Vai florescer?**
- Pressão atmosférica, vento, radiação solar e chuva acumulada
- Temperatura, salinidade, pH e oxigênio dissolvido da água
- Razões estequiométricas de nutrientes N:P, N:Si e P:Si
- Densidade celular já contada em laboratório

**Pergunta 02 — Para onde vai?**
- Correntes de maré e influência da Corrente do Brasil
- Zonas de convergência, frentes estuarinas e ressurgência
- Estratificação térmica e salina da coluna de água
- Migração vertical ativa dos dinoflagelados móveis

**Pergunta 03 — Quando passa do limite?**
- Densidade celular projetada contra o limiar de cada espécie
- Acúmulo de biotoxina no tecido do molusco
- Tempo de depuração natural por espécie cultivada
- Data provável de interdição e de desinterdição

- [ ] Validado — observações:

## 2.3 O achado

**Etiqueta:** A cadeia da previsão

**Título:** O céu prevê melhor que o satélite.

> A leitura isolada de clorofila-a por satélite se mostrou um mau preditor de floração na costa sul e sudeste do Brasil. Por isso o modelo prioriza os parâmetros meteorológicos locais como gatilho principal — em especial para Dinophysis spp. no outono e no inverno, quando a combinação de alta pressão atmosférica, ventos frios de oeste e sul e baixa radiação antecede o evento.

**Comparação:**

**Preditor principal — Meteorologia local**
> Alta pressão atmosférica, ventos frios de quadrante oeste e sul, baixa radiação solar, nebulosidade e chuva acumulada — medidos em terra, com dados de reanálise e de estações em tempo real.

*em vez de*

**Preditor rebaixado — Clorofila-a isolada**
> A concentração de clorofila vista do espaço continua no sistema como contexto, mas perdeu o papel de gatilho: sozinha, ela não anuncia a floração nesta faixa do litoral.

- [ ] Validado — observações:

## 2.4 Três escalas

**Etiqueta:** A cadeia da previsão

**Título:** Três escalas ao mesmo tempo.

> A previsão de movimentação da mancha só fecha quando as três escalas espaciais rodam integradas. Uma sozinha erra o destino.

**Escala larga — Regime regional**
- Rótulos do diagrama: Costa · ≈ 100 km · Corrente do Brasil
> Ventos regionais, correntes de maré e a influência estacional da Corrente do Brasil definem o pano de fundo do transporte da mancha.

**Escala intermediária — Encontros de água**
- Rótulos do diagrama: Estuário · Frente · ≈ 10 km · Ressurgência
> Zonas de convergência de massas de água, frentes estuarinas e processos locais de ressurgência concentram ou dispersam a floração.

**Escala pequena — Dentro da baía**
- Rótulos do diagrama: ≈ 10 m · Superfície · Picnoclina · Fundo · Migração vertical
> A estratificação térmica e salina da coluna de água em baías e estuários abrigados favorece a migração vertical ativa dos dinoflagelados móveis.

**Nota:**
> As três rodam de forma integrada: o resultado de cada escala alimenta a seguinte.

- [ ] Validado — observações:

## 2.5 As fases de alerta

**Etiqueta:** Saída do sistema

**Título:** A previsão vira uma de três fases.

As três fases aparecem uma de cada vez, conforme a pessoa rola a página ou clica no nome da fase.

**Alerta 1 — Suspeita**
- **Gatilhos:** Manchas atípicas ou espuma abundante na água. Mortandade anormal de peixes ou invertebrados. Notificação no SUS de diarreia ou parestesia após consumo recente de moluscos. Floração ativa reportada no Paraná ou em Santa Catarina.
- **Ações:** Notificação preventiva a maricultores e extratores, ordem de amostragem de água direcionada e aviso à Vigilância Sanitária e Epidemiológica para intensificar o rastreio hospitalar.

**Alerta 2 — Confirmação na água**
- **Gatilhos:** Laudo laboratorial com densidade de microalgas potencialmente tóxicas igual ou acima do limite regulatório de segurança.
- **Ações:** Sugestão de suspensão imediata da despesca, bloqueio da emissão de guias de transporte animal no sistema de defesa agropecuária, notas técnicas a banhistas e comerciantes e ordem urgente de coleta de bivalves para análise de biotoxina.

**Alerta 3 — Confirmação na carne**
- **Gatilhos:** Laudo confirmatório por HPLC ou LC-MS/MS indicando contaminação dos tecidos do molusco acima do tolerável.
- **Ações:** Interdição sanitária obrigatória dos estoques da área afetada, alerta público à imprensa recomendando cessar o consumo de mariscos da região e monitoramento laboratorial contínuo da detoxificação natural.

- [ ] Validado — observações:

## 2.6 Os limiares

**Etiqueta:** Os números que o sistema vigia

**Título:** Cada espécie tem seu próprio limite.

> É contra estes valores que a densidade celular projetada é comparada. Ultrapassou, o Alerta 2 dispara sozinho.

| Espécie | Tipo de toxina | Limite |
|---|---|---|
| Alexandrium spp. | Toxina paralisante · PSP | ≥ 200 céls/L |
| Prorocentrum lima | Toxina diarreica · DSP | ≥ 500 céls/L |
| Dinophysis spp. | Toxina diarreica · DSP | ≥ 1.000 céls/L |
| Gymnodinium spp. | Paralisante e neurotóxica | ≥ 1.000 – 2.000 céls/L |
| Pseudo-nitzschia spp. | Toxina amnésica · ASP | ≥ 50.000 céls/L |
| Pseudo-nitzschia · grupo delicatissima | Células finas · ASP | ≥ 500.000 céls/L |

**Nota:**
> Barras em escala logarítmica — a distância entre o primeiro e o último limite é de 2.500 vezes. Para Gymnodinium, o limite é 1.000 céls/L em áreas de cultivo de bivalves e 2.000 céls/L para ostras e outros organismos.

- [ ] Validado — observações:

## 2.7 Outras previsões

**Etiqueta:** Os números que o sistema vigia

**Título:** O que mais o modelo antecipa.

**Cartão 1**
- **Número:** 0,8 mg/kg — Toxinas paralisantes · PSP
> Equivalente de saxitoxina por quilo de carne de molusco. Acima disso, Alerta 3.

- **Estresse por nutrientes — Quando a alga decide produzir mais toxina**
> O sistema calcula sozinho as razões estequiométricas entre nitrogênio, fósforo e sílica a partir das concentrações de nitrito, nitrato, amônia, fosfato e silicato dissolvidos. O desequilíbrio na razão limitante é o que induz o fitoplâncton alelopático a reforçar a síntese de toxinas — ou seja, prevê não só quantas células existem, mas quão venenosas elas tendem a ficar.

- Etiquetas: N:P — nitrogênio e fósforo · N:Si — nitrogênio e sílica · P:Si — fósforo e sílica

**Cartão 2**
- **Número:** 160 µg/kg — Toxinas diarreicas · DSP
> Equivalente de ácido ocadaico e DTX por quilo de hepatopâncreas ou carne. Acima disso, Alerta 3.

- **Plastisfera costeira — Onde o plástico vira criadouro**
> Cruzando dados térmicos regionais com o mapeamento de resíduos plásticos marinhos, o modelo estima as zonas com alta adequabilidade para colonização de dinoflagelados bênticos sobre fragmentos de micro e macroplástico flutuante — espécies que produzem ciguatoxina e ácido ocadaico.

- Etiquetas: Ostreopsis cf. ovata · Gambierdiscus spp. · Prorocentrum lima

- [ ] Validado — observações:

## 2.8 A previsão que devolve o sustento

**Etiqueta:** A previsão que devolve o sustento

**Título:** Prever a volta também é prever.

> Interditar é a parte fácil. O modelo também projeta a depuração natural da toxina, para que a área volte a produzir assim que for seguro — e não semanas depois, por precaução.

**3× — Reversão do Alerta 2**
> Exige laudo comprovando densidade de microalgas abaixo do limite em três análises de água sequenciais.

**2× — Reversão do Alerta 3**
> Exige biotoxina abaixo do limite em dois resultados sequenciais de amostragens de tecido diferentes.

**Berbigão sentinela — Cada espécie se limpa em um ritmo**
> O algoritmo de depuração aplica tempos diferentes por espécie cultivada. O berbigão Anomalocardia flexuosa tem taxa experimental de detoxificação de cerca de 3% por hora para toxina diarreica — bem mais rápida que a de mexilhões e ostras. Isso permite desinterditar os bancos extrativos de berbigão antes do restante da área, em vez de manter todo mundo parado pelo prazo do organismo mais lento.

- [ ] Validado — observações:

## 2.9 A base

**Etiqueta:** Saída do sistema

**Título:** De onde vêm estas regras.

> A arquitetura foi estruturada sobre dados de ecologia costeira e ecotoxicologia e sobre os fluxos regulatórios já existentes.

| Fonte | Ano · uso |
|---|---|
| Plano de Contingência do Estado de São Paulo | 2021 · fluxo regulatório |
| Pesquisas meteorológicas da Epagri e do IFSC | 2023 · gatilhos climáticos |
| Pesquisas tróficas e de biomarcadores da UFPR | 2021 · ecotoxicologia |
| Rede de laboratórios de referência RENAQUA e LAQUA | laudos analíticos |
| GEDAVE da CDA/SAA e PGA do MAPA | rastreabilidade e trânsito |

- [ ] Validado — observações:

---

# Página 3 — Como funciona

**Título da aba do navegador:** Algamar — Como funciona

Na lateral da página há um indicador de progresso que mostra a seção atual: Início · Arquitetura · As variáveis · O ciclo · A decisão · Como medimos acerto · A saída · Continue.

## 3.1 Abertura

**Etiqueta:** Como funciona

**Título:** A máquina por trás do alerta.

> Cinco módulos separam o dado bruto da decisão sanitária. No meio deles há um modelo que aprende com o histórico — mas que, por escolha de projeto, nunca interdita nada sozinho.

- [ ] Validado — observações:

## 3.2 Arquitetura — os cinco módulos

**Etiqueta:** Arquitetura

**Título:** O caminho do dado até a decisão.

> Nada pula etapa. Uma contagem de células feita no microscópio hoje de manhã percorre os cinco módulos antes de virar uma ordem de suspensão de despesca.

| Nº | Fase | Módulo | Descrição |
|---|---|---|---|
| 01 | Coleta | Ingestão de dados | Recebe leituras de boias por API ou formulário manual, contagens de fitoplâncton por estrato de coleta e laudos de biotoxina dos laboratórios de referência. |
| 02 | Previsão | Inteligência preditiva | Roda as simulações de crescimento populacional e de dispersão, cruzando meteorologia em tempo real com a hidrodinâmica em três escalas. |
| 03 | Regras | Motor de regras | Compara os resultados com os limites regulatórios e alterna cada região entre as três fases de alerta, disparando as ações de cada uma. |
| 04 | Rastreio | Rastreabilidade | Liga a decisão à cadeia produtiva: cadastro das unidades de cultivo, bloqueio de guias de trânsito e cálculo de depuração por espécie. |
| 05 | Alerta | Vigilância e portal | Publica o status sanitário para a população, recebe notificações de casos pelo SUS e denúncias georreferenciadas de anomalias na costa. |

- [ ] Validado — observações:

## 3.3 Quatro famílias de variáveis

**Etiqueta:** Arquitetura

**Título:** Quatro famílias de variáveis.

> Elas não pesam igual. A pesquisa mostrou que os parâmetros meteorológicos locais preveem melhor do que a leitura isolada de clorofila por satélite nesta faixa do litoral — e o modelo foi montado assim.

**Família 01 — Peso alto · gatilho principal**
- Pressão atmosférica
- Direção e velocidade do vento
- Radiação solar
- Nebulosidade
- Precipitação acumulada

**Família 02 — Peso alto · transporte**
- Correntes de maré
- Corrente do Brasil
- Frentes e convergências
- Ressurgência local
- Estratificação da coluna

**Família 03 — Peso médio · condição da água**
- Temperatura
- Salinidade
- pH
- Oxigênio dissolvido
- Razões N:P, N:Si, P:Si

**Família 04 — Rótulo · valor de referência**
- Densidade celular por espécie
- Estrato de coleta
- Laudos de biotoxina
- Histórico de interdições
- Clorofila-a orbital

**Nota:**
> A família 04 não é só entrada: é o gabarito. Cada laudo de laboratório que chega diz ao sistema se a previsão daquela semana estava certa ou errada — o que torna o próprio monitoramento de rotina a fonte de treino do modelo.

- [ ] Validado — observações:

## 3.4 O ciclo de aprendizado

**Etiqueta:** Aprendizado de máquina

**Título:** Um ciclo que não fecha nunca.

> O modelo não é treinado uma vez e esquecido. Ele roda, erra, recebe o laudo que prova o erro e volta para o treino com esse caso incorporado.

**Rótulos do diagrama circular:** HISTÓRICO · TREINO · PREVISÃO · LAUDO

**Etapa 01 · Série histórica**
> Anos de registros de floração, de laudos e das condições ambientais que os antecederam formam a base de exemplos.

**Etapa 02 · Treino**
> O modelo aprende quais combinações de vento, pressão, radiação e condição da água precederam florações reais — e quais não precederam nada.

**Etapa 03 · Previsão diária**
> Com os dados do dia, ele estima a probabilidade de floração por região e projeta o transporte da mancha para os dias seguintes.

**Etapa 04 · Confronto com o laudo**
> Quando o resultado de laboratório chega, ele vira o veredito daquela previsão. Acertos e erros voltam para a base e o ciclo recomeça mais informado.

**Nota em letra menor:**
> A arquitetura de cinco módulos, os limiares e as integrações vêm da especificação de requisitos do projeto. O desenho interno do modelo — algoritmo, janela temporal e forma de validação — ainda está em definição e deve ser fechado com os dados reais de campo.

- [ ] Validado — observações:

## 3.5 A decisão

**Etiqueta:** A decisão de projeto mais importante

**Título:** O modelo sugere. A regra decide.

> Nenhuma interdição sanitária é disparada por probabilidade. O Alerta 2 exige laudo de densidade celular acima do limite; o Alerta 3 exige confirmação de biotoxina no tecido por cromatografia. O aprendizado de máquina antecipa e prioriza — a decisão que tira o sustento de alguém continua ancorada em análise laboratorial.

**O que o modelo faz — Antecipa e prioriza**
> Aponta onde a floração é provável, com quantos dias de antecedência, e ordena a fila de coleta para que o laboratório analise primeiro os pontos de maior risco.
- Estima probabilidade por região
- Projeta o transporte da mancha
- Sugere onde coletar primeiro
- Propõe a ativação do Alerta 1

**O que só a regra faz — Interdita e libera**
> Compara resultados de laboratório com limites normatizados. Sem laudo dentro do critério, nada é interditado — e nada é liberado.
- Dispara Alerta 2 e Alerta 3
- Bloqueia guias de trânsito animal
- Exige 3 análises de água para reverter
- Exige 2 análises de tecido para reverter

- [ ] Validado — observações:

## 3.6 Como medimos acerto

**Etiqueta:** Como medimos acerto

**Título:** Nem todo erro custa o mesmo.

> Um modelo de saúde pública não é avaliado só pela taxa de acerto geral. O que importa é qual tipo de erro ele comete — e o sistema é calibrado assumindo que um deles é bem mais caro que o outro.

**Matriz:**

| | Floração aconteceu | Não aconteceu |
|---|---|---|
| **Previu risco** | **Acerto — Prevenção a tempo.** A coleta foi direcionada ao ponto certo, o produtor antecipou a despesca e a interdição chegou antes do consumo. | **Falso positivo — Susto e custo.** Coleta extra de laboratório e apreensão desnecessária. Desgasta a confiança do produtor no sistema, mas ninguém adoece. |
| **Não previu** | **Falso negativo — O erro que não se aceita.** Molusco contaminado chega à mesa sem que nada tenha sido rastreado. É o erro que o sistema existe para evitar, e é por ele que o limiar de disparo é deliberadamente sensível. | **Acerto — Rotina preservada.** Nenhum alarme, nenhuma interrupção. A cadeia produtiva segue e o monitoramento continua de fundo. |

- [ ] Validado — observações:

## 3.7 A saída

**Etiqueta:** Como medimos acerto

**Título:** Previsão só vale se o aviso chegar.

| Valor | Rótulo | Descrição |
|---|---|---|
| 99,9% | Disponibilidade do motor de alertas | O envio automatizado de notificações é tratado como serviço crítico, não como funcionalidade acessória. |
| 5 min | Tempo até o disparo da notificação | Do laudo confirmado até o SMS, e-mail ou WhatsApp sair para o cadastro afetado. |
| 2FA | Autenticação de acesso ao portal | Login de vigilância sanitária e gestores exige segundo fator, dado o peso da decisão que o sistema apoia. |

**Integrações:**

| Integração | Descrição | Tipo |
|---|---|---|
| SMS e WhatsApp | Canal direto com maricultores e extratores cadastrados. | Saída |
| E-mail institucional | Vigilâncias sanitárias e epidemiológicas do SUS. | Saída |
| GEDAVE · CDA/SAA | Bloqueio automático de guias de trânsito animal de área interditada. | Integração |
| PGA · MAPA | Gestão agropecuária e rastreabilidade dos lotes de bivalves. | Integração |
| RENAQUA e LAQUA | Entrada credenciada dos laudos de ficotoxinas por HPLC, LC-MS/MS e ELISA. | Entrada |
| INMET e SimCosta | Meteorologia e oceanografia em tempo real, principal gatilho preditivo. | Entrada |
| Registro criptográfico | Histórico imutável das interdições, para impedir fraude de lotes de área interditada. | Opcional |

- [ ] Validado — observações:

## 3.8 Continue

**Etiqueta:** Continue

**Título:** Veja o que sai do outro lado.

> Os fenômenos previstos, os limiares por espécie e as três fases de alerta.

*(botão)* O que o sistema prevê

- [ ] Validado — observações:

---

# Pontos de atenção

Encontrei estes pontos ao transcrever. Todos estão no site do jeito descrito acima.

### Textos provisórios

- **1.3 O problema:** os cartões "Impacto ambiental" e "Riscos á saúde" estão com **"Texto a definir."** Precisam de texto da pesquisa.
- **1.3 O problema:** os três botões **"Ler mais"** não levam a nenhuma página.

### Números que são simulação

- **1.4 A pesquisa:** os valores **82%**, **4,3 dias** e **9%** e o gráfico de 24 semanas são ilustrativos. O próprio site avisa: "Resultado de simulação". Precisam ser trocados pelos resultados reais, ou a pesquisa precisa confirmar que podem ficar como estão.
- **3.7 A saída:** **99,9%**, **5 min** e **2FA** aparecem como fatos. A nota da seção 3.4 diz que vêm da especificação de requisitos. Vale confirmar se devem aparecer como meta e não como algo que já funciona. Hoje o software não envia SMS ou WhatsApp e não tem 2FA.

### Afirmações para conferir com a literatura

- **1.4:** o estudo usa **clorofila-a** como dado principal. Já as seções **2.3** e **3.3** dizem que a clorofila-a isolada é um **mau preditor** e foi rebaixada. Vale explicar a relação entre o estudo piloto e o modelo atual, para não parecer contraditório.
- **1.4 Período:** "8 anos de série histórica para treino". Hoje a API do software identifica o modelo como `3.0.0-sazonal-25anos`. Confirmar qual período está correto.
- **2.5 Alerta 1:** o gatilho "Floração ativa reportada no Paraná ou em Santa Catarina". Confirmar a fonte.
- **2.6:** todos os limites por espécie, incluindo os dois valores de Gymnodinium e a frase "2.500 vezes" (500.000 ÷ 200 = 2.500).
- **2.7:** 0,8 mg/kg (PSP) e 160 µg/kg (DSP).
- **2.8:** taxa de detoxificação do berbigão Anomalocardia flexuosa, "cerca de 3% por hora".
- **2.9:** anos e nomes das fontes (Plano de Contingência SP 2021, Epagri/IFSC 2023, UFPR 2021).
- **2.3:** a frase "na costa sul e sudeste do Brasil" e a sazonalidade de Dinophysis spp. (outono e inverno).

### Possíveis erros de português e de digitação

| Onde | Como está | Sugestão |
|---|---|---|
| 1.2 | "informações útil" | "informações úteis" |
| 1.3 | "Por que nos preocupar ?" | "Por que nos preocupar?" (sem espaço antes da interrogação) |
| 1.3 | "atividades económicas" | "atividades econômicas" (grafia brasileira) |
| 1.3 | "associadas á produção", "riscos á saúde" | "à produção", "à saúde" |
| 1.3 | título do cartão "Riscos á saúde" | "Riscos à saúde" |
| 1.3 | "As florações de alga" | conferir se o certo é "de algas" |
| 1.4 | "Titulo", "Periodo" | "Título", "Período" |
| 1.4 | "Complexo estuarino de Iguape-Cananéia" | conferir maiúsculas: "Complexo Estuarino-Lagunar de Iguape-Cananéia" |
| 1.5 | "Software Architects" (Igor e João Francisco) | "Software Architect" (singular, por pessoa) |
| 1.5 | Joicy: "…integração Levantamento bibliográfico…" | falta vírgula: "…integração, Levantamento bibliográfico…" |
| 1.5 | "Quem está por trás do Algamar." e, em outras partes, "a Algamar" e "a ALGAMAR" | padronizar o gênero (a/o Algamar) e a grafia (Algamar ou ALGAMAR) |
