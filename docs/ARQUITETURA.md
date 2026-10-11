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

---

# ADR-004: 30 fases, 2 modos novos, gelo e conserto do controle

**Status:** Aceito · **Data:** 2026-10-11

## Contexto
Pedido: muito mais fases (30), modos de jogo novos, deixar o jogo "mais interessante, interativo", e consertar
bugs reais no suporte a controle (relatado como "bugado" em algumas partes).

## Decisões

- **O bug do controle era de verdade.** `input.ts` lia `navigator.getGamepads()[0]` pro jogador 1 e `[1]` pro
  jogador 2 — mas esse índice é a posição que o navegador deu ao controle (estável desde a primeira vez que ele
  mandou um botão), não "o primeiro plugado". Com um controle só, se ele calhasse de ocupar o slot 1 (comum
  depois de desconectar/reconectar), o jogador 1 ficava sem resposta nenhuma. Corrigido filtrando os controles
  realmente conectados e ordenando pelo índice antes de atribuir aos dois jogadores — testado simulando
  `navigator.getGamepads()` (`scripts/smoke-input.ts`), inclusive o caso específico do bug (controle só, no
  índice 1). De quebra: zona morta do analógico ganhou reescala suave (em vez de corte duro) e o jogo passou a
  vibrar o controle em entregas, nocaute no ladrão, queda no buraco e fogo pegando — tudo com *feature-detection*
  silenciosa pra não quebrar em controle/navegador sem suporte.

- **30 fases, não 30 mecânicas novas.** Construir e testar 10 mecânicas inéditas com o mesmo rigor que o ladrão
  exigiu (ADR-003) não cabia numa sessão só. Em vez disso, duas peças novas e pequenas — `rush` (multiplicador do
  ritmo de pedidos, já existia uma fórmula dinâmica em `updateOrders`, só ficou parametrizável) e `ice`
  (piso escorregadio, calculado como a poça do ladrão — nunca em cima do mapa, sempre longe dos dois spawns) — se
  combinam com o que já existia (fenda, ladrão, pratos sujos) pra dar variedade real em 30 fases com curva de
  dificuldade, sem inventar sistemas arriscados demais pra validar a tempo. As fases 1–5 originais não mudaram
  (o id é a chave do progresso salvo; mudar teria embaralhado o save de quem já jogou).

- **Mundos em acordeão, não 30 cards soltos.** Uma grade plana de 30 cards seria uma rolagem enorme sem
  estrutura. `WORLDS` (`src/game/content.ts`) só agrupa a exibição — a lógica de fase continua igual, cada uma
  isolada. O mundo que contém a próxima fase não conquistada abre sozinho; os outros ficam fechados mas
  clicáveis, então dá pra espiar o que vem (nome, mecânica) sem conseguir jogar antes da hora.

- **Sobrevivência tem relógio, prêmio e fim de partida diferentes da campanha** — por isso virou campo próprio
  (`endless: { maxStrikes }`) em vez de mais uma combinação de `gap`/`heist`/`ice`. `gs.time` passa a contar PRA
  CIMA (tempo sobrevivido) em vez de regressivo, e o fim de partida vem de errar `maxStrikes` pedidos, não do
  cronômetro. Guardei isso atrás de uma flag explícita pra não arriscar um `if` esquecido fazendo uma fase normal
  se comportar como infinita.

- **Modo Livre e Sobrevivência são `LevelDef` com id fora de 1–30** (`0` e `-1`) — não entram em `LEVELS`/`WORLDS`
  nem ganham estrela de verdade (limiares de propósito inalcançáveis), mas passam pelo exato mesmo motor,
  `MapPicker`, pausa e `ResultScreen` que a campanha usa. Zero código novo de navegação; só ids reservados e
  alguns `if (isCampaign)` na tela de resultado pra não mostrar "faltaram 999940 pontos pra 1ª estrela".

## Testado
- `npm run test` (5 suítes, `scripts/smoke-*.ts`): controle (índice fora de ordem, zona morta, borda de aperto),
  gelo (gerado nas 6 arenas sempre longe dos spawns, física de escorregar, `rush` comparado sem e com
  multiplicador), modos (Livre não acaba sozinho em 5 min simulados; Sobrevivência conta pra cima, acaba sozinha
  depois de 3 pedidos perdidos, ritmo acelera com o tempo).
- Corrigi de passagem uma flakiness pré-existente no teste do nocaute do ladrão (a perseguição simulada por IA
  simples às vezes não alcançava o ladrão dentro da janela de 10s, por puro azar do desvio aleatório dele) —
  agora tenta até 8 vezes, refletindo que no jogo real o jogador tem várias visitas por partida pra acertar.
- Navegador: acordeão com os 6 mundos e progresso somado por mundo; fase 30 (fenda + gelo + ladrão + ritmo +
  cardápio inteiro, tudo junto) rodando sem erro, com fenda e gelo visíveis ao mesmo tempo; mundo bloqueado
  mostrando o aviso certo; Modo Livre com relógio de 60 minutos; Sobrevivência com relógio subindo e os 3
  corações da HUD.

## Consequências
- Mais fácil: fase nova = um item em `LEVELS` + um em `WORLDS`; mecânica de variedade nova (tipo `ice`) só pede
  um campo opcional em `LevelDef` e uma função `createGame` calculada, seguindo o padrão já aberto pelo ladrão.
- A vigiar: as 25 fases novas têm progressão de dificuldade pensada (duração, limiares de estrela, intensidade
  das mecânicas crescendo por mundo) mas não foram jogadas de ponta a ponta por um humano — um ajuste fino de
  `stars`/`duration` depois de alguns playthroughs reais é esperado, principalmente no mundo 6.
