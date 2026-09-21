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
