# ADR-001: Reescrita do jogo em canvas com motor separado

**Status:** Aceito · **Data:** 2026-09-16

## Contexto
A versão anterior tinha todo o jogo em um único `App.tsx` (1.832 linhas) desenhado com `div`s e re-renderizado pelo React 30x por segundo. Problemas encontrados:

| Problema | Efeito | Gravidade |
|---|---|---|
| Re-render de centenas de `div`s por quadro | travadas, uso alto de CPU | Alta |
| Interação escolhia a estação mais próxima em qualquer direção | chef pegava coisa atrás dele | Alta |
| Estações de ingrediente/entrega criadas na mesma célula das paredes | duas estações no mesmo lugar | Média |
| Movimento em eixo da grade num mapa isométrico | W/A/S/D andava na diagonal da tela | Média |
| README dizia `/` para o jogador 2, código usava `M`; tutorial dizia "aperte de novo para cortar", código cortava sozinho | instruções erradas | Média |
| `setTimeout` do primeiro pedido sem limpeza | pedido aparecia depois de sair da fase | Baixa |
| 9 dependências sem uso (supabase, dnd-kit, recharts...) | install mais lento | Baixa |
| Nome e imagem de capa de um jogo comercial | risco de marca/direitos | Alta |

## Decisão
- **Canvas 2D** para o jogo; React só para menus, pausa e resultado.
- **Motor puro** (`engine.ts`) que recebe `(estado, dt, controles)` e não sabe nada de tela → dá para testar sem navegador.
- **Visão de cima levemente inclinada** (bancadas com face frontal), desenhada em ordem de profundidade por linha.
- **Alvo = estação à frente do chef** (ponto projetado na direção do olhar + produto escalar), com destaque visual.
- **Mapas em ASCII** e **constantes em `TUNING`** para ajustar dificuldade sem mexer na lógica.

## Opções consideradas
- **Manter DOM e otimizar (memo/virtualização):** menos reescrita, mas a lógica continuaria presa à UI e a interação continuaria errada.
- **Phaser/PixiJS:** mais recursos, porém +300–600 kB e curva de aprendizado; o jogo cabe bem em Canvas 2D puro (~65 kB gzip com React).

## Consequências
- Mais fácil: testar regras, criar fases, ajustar tempos.
- Mais difícil: acessibilidade dentro do canvas (os menus seguem em HTML acessível).
- Revisar depois: controles por toque no celular; online multiplayer exigiria mover o motor para um servidor autoritativo.

---

# ADR-002: Separar regras da fase do mapa, e mapas universais

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Pedido: deixar o jogador escolher o mapa antes de cada fase, com 6 cozinhas temáticas.
Até então `LevelDef` carregava o mapa ASCII e as cores junto com as regras (receitas, duração, estrelas), então
"fase" e "mapa" eram a mesma coisa e não dava para combinar as duas escolhas.

O problema difícil não é desenhar 6 mapas — é que qualquer fase precisa rodar em qualquer mapa. Um mapa sem pia
quebra a fase 2 (pratos sujos); um sem frigideira quebra o hambúrguer; um sem a fenda esvazia a fase 3.

## Decisão
- `LevelDef` fica só com as **regras**; o layout e o visual saem para `ArenaDef` (`src/game/maps.ts`).
  `GameState` passa a carregar os dois, e `createGame(level, arena, solo, avatars)` os combina.
- **Toda arena é uma cozinha completa**: as 5 caixas de ingrediente, panela, frigideira, tábua, pia, escorredor,
  lixo, entrega, extintor e a fenda. É a invariante que sustenta "qualquer fase em qualquer mapa".
- A fenda é sempre uma coluna contígua vedada por bancada nas duas pontas. Em fase sem `gap` ela vira chão comum
  (inclusive sem a rachadura desenhada), então não vira enfeite sem função.
- As arenas são validadas por script: largura uniforme, estações obrigatórias presentes, tudo alcançável a partir
  do spawn, vazio nunca encostando no chão jogável, e — com a fenda aberta — os dois lados separados e cada um com
  pelo menos uma caixa e uma tábua.

## Opções consideradas
- **Marcar quais fases aceitam quais mapas:** menos trabalho por mapa, mas vira uma matriz de compatibilidade que
  o jogador não enxerga e que quebra calado quando alguém adiciona receita nova.
- **Gerar as estações que faltam em tempo de execução:** esconderia erro de layout e mudaria a cozinha sem o
  jogador entender por quê.

## Consequências
- Mais fácil: cada mapa novo é um item em `ARENAS` + um caso nos dois `switch` de tema; nada na lógica.
- Mais caro: todo mapa carrega estações que certas fases não usam (pia na fase 1, por exemplo). É espaço ocupado
  em troca de composição livre — aceitável porque a cozinha continua legível.
- A vigiar: o progresso é por fase, não por (fase, mapa). Se um mapa se mostrar bem mais fácil que os outros, o
  recorde da fase deixa de comparar coisas iguais e aí vale separar.

---

# ADR-003: Mais receitas, mais fases e a fase do ladrão

**Status:** Aceito · **Data:** 2026-09-21

## Contexto
Pedido: mais receitas, mais níveis, e um nível novo em que um ladrão invade a cozinha em algum momento aleatório
pra roubar uma panela — nocauteado com um taco de beisebol se for pego a tempo, ou foge levando a panela embora
de vez, com a cozinha escurecendo e uma luz seguindo os chefs enquanto isso acontece.

O ponto difícil não foi a mecânica do ladrão em si — foi encaixá-la sem furar a invariante do ADR-002 ("qualquer
arena serve para qualquer fase"). O ladrão precisa de uma porta e de um taco de beisebol, e nenhuma das 6 arenas
tem esses elementos no mapa.

## Decisões

- **Porta e taco calculados, não desenhados no mapa.** Em `createGame`, quando a fase tem `heist`, um algoritmo
  acha o canto mais afastado do meio-termo dos dois spawns, encostado numa parede (`pickDoorTile`) pra porta, e a
  bancada livre mais central (`placeBat`) pro taco. Assim o ladrão funciona em qualquer uma das 6 cozinhas sem
  editar nenhum mapa — a mesma arena que serve pra sopa serve pro assalto.
- **Perda de panela é por tile, não por contagem.** Em vez de um contador global "panelas restantes", o fogão
  roubado ganha `tile.stolen = true` e passa a recusar qualquer panela (inclusive uma carregada de outro fogão —
  o jogo já deixava levar a panela inteira pela cozinha, então sem essa checagem em `accepts()` daria pra
  "reabastecer" o fogão roubado). Sempre sobra pelo menos 1 panela: `updateHeist` para de convocar o ladrão
  quando só resta uma.
- **Nocaute sempre cancela o roubo, mesmo com a panela já em mãos.** Mais simples de explicar e de programar do
  que dois desfechos parciais diferentes — "acertou o taco" tem um único significado.
- **10 segundos são um prazo, não uma distância.** Se o alarme zera antes dele alcançar a panela na animação, o
  roubo se completa na mesma hora (a mensagem e o resultado nunca desencontram). O caminho dele até lá usa
  desvios aleatórios de verdade (`moveThief`): 40% das vezes ele erra o alvo de propósito antes de corrigir,
  então nunca anda em linha reta.
- **A luz é uma máscara num canvas auxiliar.** `destination-out` não "revela" o que já foi pintado — ele apaga
  pixel de verdade. Por isso a cozinha escura não é pintada direto: um canvas à parte recebe o véu escuro e os
  buracos de luz (`destination-out` nele mesmo), e só o resultado final é colado na tela com `drawImage`. Um
  detalhe que dói fácil: esse `drawImage` precisa desfazer temporariamente o `scale*dpr` do canvas do jogo (lido
  de `ctx.canvas.width/height`), senão a máscara entra escalada duas vezes.

## Opções consideradas
- **Marcar 1-2 arenas com porta fixa no mapa, só essas jogáveis na fase 5:** menos matemática, mas quebra a
  promessa "qualquer mapa, qualquer fase" bem quando o pedido pede mais variedade, não menos.
- **Contador global de panelas perdidas em vez de marcar o tile:** mais simples de somar, mas não impede repor
  via panela carregada de outro fogão — teria um furo óbvio no primeiro playtest.

## Testado
- `npm run test` (`scripts/smoke-heist.ts`, `scripts/smoke-arenas.ts`): roubo sem intervenção perde 1 panela e
  bloqueia reposição; taco nocauteia e devolve a panela se já estava em mãos; porta e taco aparecem nas 6 arenas
  e nas 5 fases.
- Navegador: ~55 s de partida real na fase 5 sem apertar nada — cozinha escurece com luz em cada chef, ladrão e
  porta aparecem na sombra, mensagem de fuga, fogão fica com X vermelho depois. Nocaute forçado via injeção de
  estado pra confirmar a pose caída + estrelas girando.

## Consequências
- Mais fácil: qualquer arena nova herda o ladrão de graça, sem precisar desenhar porta.
- Mais caro: duas passagens de canvas por quadro durante o assalto (a cena normal + a máscara). Só acontece
  enquanto `gs.thief` existe, então não pesa no resto do jogo.
- A vigiar: com só 2 chefs perseguindo, o taco pode ficar longe demais do ladrão em mapas maiores — se algum
  layout futuro for bem maior que os 6 atuais, vale repensar `heistSpeed`/`heistAlarm` nesse caso.
