# Design

Sistema visual do Apoio à Regulação Clínica (SES-DF / SISREG).

**Fonte da identidade:** capa do `MINICURSO CHATBOTS | GUIA RAG`. As cores abaixo foram
amostradas pixel a pixel daquela capa, não escolhidas a gosto. As páginas internas do PDF são
Google Docs cru (Arial sobre branco) e não contam como referência visual.

**Register:** product. O design serve a tarefa clínica; ele não é o produto.

---

## 1. Tema

Escuro, sobre o navy da marca. Isso não é o default de "ferramenta parece melhor escura": é a cor
que ocupa 75% da capa e carrega a identidade do material.

> **Questão em aberto:** o uso real é diurno, em consultório sob luz fluorescente, e os sistemas
> vizinhos (SISREG, prontuário) são claros. Um tema claro derivado dos mesmos matizes pode reduzir
> o estranhamento ao alternar entre sistemas. Não resolvi isso aqui porque a decisão depende de ver
> o profissional usando. Toda cor abaixo é token, então a variante clara é um bloco novo de
> `:root`, não uma reescrita.

---

## 2. Cor

### 2.1 Amostragem da capa

Seis cores, com a participação real na arte:

| Cor | Hex | OKLCH | % da capa | Contraste no navy |
|---|---|---|---|---|
| Navy (fundo) | `#161A4D` | `oklch(0.250 0.093 274)` | 75,2% | — |
| Oxblood | `#521339` | `oklch(0.308 0.102 348)` | 11,1% | 1,17:1 |
| Cinza-roxo | `#504753` | `oklch(0.411 0.023 318)` | 5,5% | 1,84:1 |
| Índigo (robô) | `#3A49AE` | `oklch(0.454 0.161 272)` | 1,5% | 2,13:1 |
| Dourado | `#F3C967` | `oklch(0.853 0.126 86)` | 1,3% | 10,37:1 |
| Azure | `#3175C2` | `oklch(0.558 0.138 254)` | 0,1% | 3,46:1 |

Três delas **reprovam como texto** sobre o próprio fundo da marca: oxblood (1,17:1), índigo (2,13:1)
e azure (3,46:1, só serve para texto grande). Na capa isso não importa, porque lá são formas
preenchidas. Numa interface de leitura, importa. Cada uma ganha abaixo uma versão clareada que
preserva o matiz e passa em 4,5:1.

### 2.2 Tokens

```css
:root {
  /* Superfícies — todas derivadas do navy da capa, mesmo matiz (274-276) */
  --bg:           #161A4D;  /* oklch(0.250 0.093 274) — o navy da capa */
  --surface:      #1E2359;  /* oklch(0.287 0.096 275) — bolhas do bot, cartões */
  --surface-2:    #272C66;  /* oklch(0.324 0.101 276) — hover, cabeçalhos de tabela */
  --input:        #10143B;  /* oklch(0.215 0.074 274) — campos de entrada, mais fundo que o bg */
  --line:         #343A73;  /* oklch(0.374 0.097 276) — bordas 1px */

  /* Tinta */
  --ink:          #EEF0FA;  /* 14,34:1 — corpo e títulos */
  --ink-muted:    #A8AFD4;  /*  7,56:1 — legendas, rótulos, placeholder */
  --ink-faint:    #7B83AE;  /*  4,42:1 — SÓ texto grande e ícones decorativos */

  /* Marca — versões legíveis */
  --gold:         #F3C967;  /* 10,37:1 — inalterada, já passa */
  --azure:        #7AB3EC;  /*  7,36:1 — clareada de #3175C2 */
  --indigo:       #8E9BEA;  /*  6,23:1 — clareada de #3A49AE */
  --oxblood:      #D98BA8;  /*  6,37:1 — clareada de #521339 */

  /* Marca — versões de preenchimento (formas, nunca texto) */
  --indigo-fill:  #3A49AE;  /* índigo da capa, como na silhueta do robô */
  --oxblood-fill: #521339;  /* oxblood da capa, só em superfície decorativa */
}
```

### 2.3 Papéis

| Papel | Token | Onde |
|---|---|---|
| Ação primária, interativo | `--azure` | botões de envio, links, aba ativa, foco |
| Identidade | `--gold` | marca, títulos de display, estado vazio, tela de identificação |
| Preenchimento decorativo | `--indigo-fill` | avatares, fundo de ícone, barras do painel |
| Superfície rara | `--oxblood-fill` | faixa da tela de identificação, nada mais |

O azure é o interativo, não o dourado. Motivo na regra 1 abaixo.

### 2.4 Classificação de risco

A paleta clínica é **separada da paleta da marca** e não negocia com ela.

```css
:root {
  --risco-vermelha: #FF6B6B;  /*  5,87:1 */
  --risco-amarela:  #FFD93D;  /* 11,83:1 */
  --risco-verde:    #4ADE80;  /*  9,35:1 */
  --risco-azul:     #60A5FA;  /*  6,41:1 */
}
```

---

## 3. Duas regras que não se quebram

### Regra 1 — O dourado da marca nunca sinaliza estado

O dourado `#F3C967` e o amarelo de risco `#FFD93D` têm **1,14:1 de contraste entre si**: a olho nu
são a mesma cor. Num sistema cuja saída é uma classificação de risco, um botão dourado ao lado de
um selo "Risco: Amarela" lê como se os dois dissessem a mesma coisa.

Por isso:

- O dourado aparece como **cor de tipografia** e em **momentos de marca** (logo, display, estado
  vazio, tela de identificação). Nunca como ponto, pílula, selo ou marcador de status.
- Dentro da área de mensagens e do painel, onde vivem os selos de risco, o dourado não entra.
- A cor de ação é o azure. Um botão e um selo passam a ter cor e forma diferentes, não só forma.

Foi por isso que o interativo virou azure em vez do dourado, que seria a escolha mais bonita.

### Regra 2 — Risco nunca é comunicado só por cor

Simulei a paleta de risco sob daltonismo. Sob deuteranopia:

| | Normal | Deuteranopia |
|---|---|---|
| Vermelha | `#FF6B6B` | `#AFAF62` |
| Verde | `#4ADE80` | `#BDBD85` |

Vermelha e Verde, os dois extremos da urgência, colapsam para quase o mesmo oliva (distância 0,160
num espaço onde o par mais próximo com visão normal é 0,556). Cerca de 8% dos homens têm
deficiência de visão para vermelho/verde.

Todo indicador de risco carrega, sempre, **cor + rótulo em texto + forma distinta**:

| Nível | Forma |
|---|---|
| Vermelha | círculo preenchido |
| Amarela | triângulo |
| Verde | círculo vazado |
| Azul | quadrado arredondado |

O código atual já escreve `Risco: {corRisco}` ao lado do ponto. Isso estava certo e fica. O que
falta é a forma distinta por nível.

---

## 4. Tipografia

Três vozes, uma regra que decide qual usar:

> **Serifada é o que o sistema diz. Sem serifa é o que você digita e os controles.
> Mono é o artefato que sai daqui.**

```css
--font-serif: "Source Serif 4", "Iowan Old Style", Georgia, serif;
--font-ui:    "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
--font-mono:  "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

| Voz | Onde | Por quê |
|---|---|---|
| Serifada | respostas do agente, títulos, display | é prosa para ler, não dado para escanear |
| Sem serifa | mensagens do profissional, rótulos, botões, tabelas, métricas | dado conferido e controles, escaneados e não lidos |
| Mono | texto do SISREG, devolução, blocos de código, células de tabela | artefato de máquina, feito para copiar e colar |

A versão anterior usava Inter no corpo. Inter é a grotesca de interface mais
saturada da última década e, no corpo do texto, lia como documento de editor de
texto genérico. A serifada resolve isso e ainda alinha com o mundo em que o
produto vive: prontuário, laudo e Nota Técnica são documentos serifados.

**Source Serif 4** foi desenhada para leitura em tela, tem altura-x grande e
hastes firmes, e é variável de 400 a 700. **IBM Plex Sans** carrega o cromo com
caráter institucional e numerais tabulares bons para o painel. **IBM Plex Mono**
é da mesma superfamília, então o artefato final e a interface conversam.

Montserrat foi considerada e descartada: é uma das famílias mais usadas da web
(trocaria um default por outro), as formas geométricas largas comem espaço
horizontal numa interface densa, e ela perde definição nos tamanhos pequenos de
rótulo e tabela.

### Piso de tamanho para a serifada

Serifada **nunca abaixo de 1rem (16px)**. O alvo provável é a máquina da UBS,
1366x768 e sem retina, onde serifada pequena vira mancha. Tudo que é menor que
isso (rótulo de 11px, célula de tabela, botão de 13px) fica na sem serifa, o que
neutraliza o risco.

### Escala

| Papel | Família | Tamanho | Peso | Tracking |
|---|---|---|---|---|
| Display | serifada | `clamp(1.875rem, 4vw, 2.5rem)` | 700 | `-0.015em` |
| H1 de tela | serifada | `1.5rem` | 700 | `-0.01em` |
| H2 de seção | serifada | `1.125rem` | 600 | `-0.005em` |
| Prosa do agente | serifada | `1rem` | 400 | 0 |
| Corpo / entrada | sem serifa | `0.9375rem` | 400 | 0 |
| Secundário | sem serifa | `0.8125rem` | 400 | 0 |
| Rótulo | sem serifa | `0.6875rem` | 600 | `0.06em`, maiúsculas |
| Número de métrica | sem serifa | `2rem` | 700 | `-0.02em`, `tabular-nums` |
| Artefato SISREG | mono | `0.8125rem` | 400 | 0 |

Razão entre degraus ≥1,25. Teto do display em 2,5rem: a interface é 90% leitura
e display maior rouba altura.

Serifada pede tracking mais solto que grotesca. O `-0.03em` que a versão
anterior usava no display fecharia as letras da Source Serif; o piso aqui é
`-0.015em`.

### Regras

- Corpo entre 65 e 75ch. A bolha de mensagem fica em `max-width: 68ch`.
- `text-wrap: balance` em h1–h3; `text-wrap: pretty` na prosa do agente.
- `font-variant-numeric: tabular-nums` em toda métrica e em qualquer número que
  atualize.
- Maiúsculas só em rótulos de até 4 palavras. Nunca em frase.
- Siglas e unidades dentro da prosa (`TSH`, `mg/dL`) saem para a mono: são dado,
  não frase.

## 5. Espaçamento, raio, elevação

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 24px;  --space-6: 32px;  --space-7: 48px;  --space-8: 64px;

--radius-sm: 6px;    /* selos, botões pequenos */
--radius-md: 10px;   /* botões, campos */
--radius-lg: 14px;   /* cartões, bolhas, modal */
--radius-pill: 999px;

--shadow-raised: 0 2px 6px rgb(8 10 30 / 0.4);
--shadow-overlay: 0 16px 40px rgb(8 10 30 / 0.55);
```

- Raio de cartão no teto de 14px. Nada de 24/32px.
- **Borda 1px e sombra larga nunca no mesmo elemento.** Superfície elevada usa `--surface` +
  borda `--line`; só o modal usa `--shadow-overlay`, e sem borda.
- Sem cartão dentro de cartão. O painel hoje tem blocos com tabela dentro; a tabela não ganha
  fundo nem borda própria.

### Z-index

```css
--z-dropdown: 10;  --z-sticky: 20;  --z-backdrop: 30;
--z-modal:    40;  --z-toast:  50;  --z-tooltip: 60;
```

A lista de unidades da tela de identificação usa `--z-dropdown` e precisa escapar do
`overflow` do cartão: `position: fixed` ancorada ao campo, ou `popover`.

---

## 6. Motion

```css
--ease: cubic-bezier(0.22, 1, 0.36, 1);  /* ease-out-quart */
--dur-fast: 120ms;   /* hover, foco */
--dur-base: 200ms;   /* entrada de mensagem, troca de aba */
--dur-slow: 320ms;   /* modal */
```

- Só `transform` e `opacity`. Nada de animar `height` ou `width`.
- Mensagem nova entra com `translateY(6px) → 0` + fade em `--dur-base`. A lista não re-anima
  mensagens antigas quando chega uma nova.
- Os três pontos de "gerando resposta" são a única animação em laço da interface.
- Sem bounce, sem elástico.
- O conteúdo é visível por padrão; a animação melhora a entrada, nunca controla a visibilidade.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

---

## 7. Componentes

Mapeamento sobre o que já existe em `frontend/src/App.css`.

### Sidebar
Fundo `--surface`, borda direita `--line`. Largura 272px, colapsa abaixo de 900px. Item ativo:
fundo `--surface-2` + texto `--ink`, **sem faixa lateral colorida**. O estado ativo é fundo e peso.

### Bolha de mensagem
- Bot: `--surface`, borda `--line`, raio `--radius-lg` com o canto inferior esquerdo em
  `--radius-sm`. `max-width: 68ch`.
- Profissional: `--indigo-fill`, texto `--ink`, canto inferior direito em `--radius-sm`.
- Sistema/erro: fundo `color-mix(in oklch, var(--risco-vermelha) 12%, var(--bg))`, borda em
  `color-mix(in oklch, var(--risco-vermelha) 35%, transparent)`, texto `--ink`.
- Horário em `--ink-faint`, `0.6875rem`.

### Selo de risco
Pílula `--radius-pill`, fundo `color-mix(in oklch, var(--risco-X) 14%, var(--bg))`, texto e forma
na cor cheia. Conforme a regra 2: forma + rótulo, sempre.

### Bloco copiável (SISREG / devolução)
`--font-mono`, fundo `--input`, borda `--line`, raio `--radius-lg`, `white-space: pre-wrap`.
Botão "Copiar texto" no canto superior direito, com confirmação em texto (não só ícone). É o
produto final do sistema e deve parecer um artefato, não uma mensagem.

### Métricas do painel
Sem grade de cartões idênticos. O número principal em `2rem`/700 sobre o fundo da página, com
rótulo em `--ink-muted` abaixo; separadores por borda `--line`, não por cartão. Alerta de urgência
é o único com superfície própria, tingida com `--risco-vermelha` a 10%.

### Barras do painel
`--indigo-fill` para séries neutras; a paleta de risco só quando a série **é** risco. Trilho em
`--surface-2`.

### Campos
Fundo `--input`, borda `--line`, raio `--radius-md`. Foco: borda `--azure` +
`box-shadow: 0 0 0 3px color-mix(in oklch, var(--azure) 25%, transparent)`. Placeholder em
`--ink-muted` (7,56:1), nunca em `--ink-faint`.

### Botões
- Primário: fundo `--azure`, texto `#0E1430` (escuro sobre claro, 8,17:1).
- Fantasma: texto `--ink`, borda `--line`, fundo transparente.
- Foco visível em todos: `outline: 2px solid var(--azure); outline-offset: 2px`.
- Rótulo é verbo + objeto: "Copiar texto", "Revisar encaminhamento". Nunca "OK".

### Modal de revisão
`--surface`, `--radius-lg`, `--shadow-overlay`, sem borda. Backdrop
`rgb(8 10 30 / 0.6)`. Abaixo de 860px as duas colunas viram uma, com o relato primeiro.

---

## 8. Acessibilidade

- Corpo ≥4,5:1, texto grande ≥3:1. Todos os tokens acima estão medidos.
- `--ink-faint` é o único abaixo da linha: 4,42:1 sobre `--bg` e **3,96:1 sobre `--surface`**.
  Proibido em corpo. Liberado em texto ≥18px e ícone decorativo, e mesmo assim só sobre `--bg`.
- Valores medidos nos pares que o código realmente produz: `--ink` no bloco mono sobre `--input`
  15,59:1; `--ink` na bolha do profissional sobre `--indigo-fill` 6,73:1; `--ink-muted` sobre
  `--surface` 6,77:1; selos de risco sobre o próprio fundo tingido entre 5,15:1 (Vermelha) e
  9,34:1 (Amarela).
- Nenhuma informação só por cor. Vale para risco e para qualquer estado futuro.
- Foco visível em tudo que recebe teclado. A lista de unidades precisa de navegação por setas e
  `aria-activedescendant`.
- Alvo de toque ≥44px no celular.
- `prefers-reduced-motion` respeitado.

---

## 9. Em aberto

1. **Tema claro** para uso diurno em consultório (seção 1).
2. **Identidade gov.br / GDF**: se o sistema virar oficial da SES-DF, a paleta da capa pode ter que
   ceder ao design system do governo. Hoje seguimos a capa.
3. **Ambiente real**: resolução e navegador das máquinas de UBS definem o breakpoint principal.
   Assumi 1366x768 como alvo até ter o dado.
