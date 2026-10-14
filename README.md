# 🍳 Panelaço!

Jogo de cozinha cooperativo para **1 ou 2 jogadores** no mesmo computador (teclado ou controle).
Pique, cozinhe, monte e entregue os pedidos antes do tempo acabar — sem deixar a cozinha pegar fogo.

Inspirado no gênero "cozinha caótica cooperativa". Todo o visual, nomes e fases são originais.

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # gera dist/
npm run typecheck
npm run test        # testes de lógica (receitas, mapas, fase do ladrão)
```

## Controles

| Ação | Chef 1 | Chef 2 | Controle |
|---|---|---|---|
| Andar | W A S D | Setas | Analógico / D-pad |
| Pegar / soltar | Espaço | Enter (ou K) | A |
| Cortar · lavar · jogar · extintor · taco | E | Shift direito (ou L) | X |
| Correr (dash) | Shift esquerdo | Ctrl direito (ou ;) | B |
| Trocar de chef (modo 1 jogador) | Q ou Tab | — | LB / RB |
| Pausa | Esc ou P | Esc ou P | Start |

## Personalizar os chefs

No menu, cada chef tem um editor com prévia ao vivo (desenhada pelo mesmo código do jogo):

| Item | Opções |
|---|---|
| Nome | até 14 caracteres — a inicial aparece na bolinha acima do chef e o nome na tabela de controles |
| Chapéu | chapéu de chef, bandana, boné, gorro, coroa ou sem chapéu |
| Uniforme | 8 cores |
| Cor do chapéu | 8 cores |
| Pele | 6 tons |

Fica salvo no navegador (`panelaco:avatars:v1`). No modo 1 jogador só aparece o editor do Chef 1.

## Mapas

Antes de cada fase você escolhe em qual cozinha jogar. São 6, com miniatura da planta no menu:

| # | Cozinha | Lugar | Cenário |
|---|---|---|---|
| 1 | Izakaya do Bairro | 🇯🇵 Japão | tatame, lanternas de papel, torii e pétalas caindo |
| 2 | Bistrô da Esquina | 🇫🇷 França | piso xadrez, toldo listrado, torre e telhados |
| 3 | Cozinha do Mirante | 🇧🇷 Brasil | calçadão em ondas, morros, mar e coqueiros |
| 4 | Sabor do Baobá | 🌍 África | barro batido com grafismos, baobá e acácias no pôr do sol |
| 5 | Lanchonete da Rota | 🇺🇸 EUA | piso quadriculado, neon piscando e a estrada passando |
| 6 | Galeão Faminto | 🏴‍☠️ Alto-mar | convés de tábua, mar em volta do casco, tubarões e gaivotas |

**Toda cozinha é completa**: tem as 5 caixas de ingrediente, panela, frigideira, tábua, pia, escorredor, lixo,
entrega e extintor. Por isso qualquer fase roda em qualquer mapa — muda o formato do salão e o país, não as regras.

Todas têm também a fenda do meio (coluna `~`), vedada em cima e embaixo por bancada. Nas fases sem `gap` ela é
chão comum; na fase 3 ela abre e racha a cozinha em duas metades com estações diferentes de cada lado — aí a saída
é arremessar por cima do buraco.

## Como funciona

1. **Caixas de madeira** dão ingredientes infinitos.
2. **Tábua**: solte o ingrediente e aperte *usar* para cortar (o chef continua cortando até você andar).
3. **Panela**: 3 ingredientes picados de tomate/cebola (num só sabor ou misturados) viram sopa. **Frigideira**: carne picada vira hambúrguer.
4. Passou do ponto → o ícone **!** pisca → queima → **pega fogo** e o fogo se espalha. Use o **extintor** (segure *usar*).
5. **Monte no prato** (dá para levar o prato até a panela ou a panela até o prato) e entregue na **ENTREGA**.
6. Pratos voltam pela janela **PRATOS** alguns segundos depois. Nas fases 2, 4 e 5 voltam **sujos**: lave na **pia** e pegue no escorredor.
7. Com um ingrediente na mão, *usar* **arremessa** ele. Ele cai em bancadas, panelas e pratos — e o outro chef pode pegar no ar.
8. **Gorjeta**: quanto mais rápido, maior. Entregar na ordem dos pedidos multiplica a gorjeta (até x4). Pedido vencido = −10.

## Receitas

| Prato | Ingredientes |
|---|---|
| Sopa de Tomate / Sopa de Cebola | 3 do mesmo, picados, na panela |
| Sopa Mista | 3 picados (tomate + cebola misturados) na panela |
| Salada Verde | alface picada |
| Salada Mista | alface + tomate picados |
| Salada Completa | alface + tomate + cebola picados |
| Sanduíche Verde | pão + alface + tomate (sem carne, sem fogão) |
| Hambúrguer | pão + carne na frigideira |
| X-Cebola | pão + carne + cebola picada |
| X-Salada | pão + carne + alface |
| X-Tudo | pão + carne + alface + tomate + cebola |

## Fases

| # | Nome | Novidade | Estrelas |
|---|---|---|---|
| 1 | Sopa na Serra | panela, fogo, extintor | 60 / 140 / 220 |
| 2 | Lanchonete do Porto | frigideira, salada, pratos sujos e pia | 60 / 150 / 240 |
| 3 | Cozinha Rachada | o chão do meio abre de tempos em tempos (quem cai renasce em 5 s) | 50 / 130 / 210 |
| 4 | Fim de Semana Lotado | cardápio inteiro + pratos sujos + fenda, tudo junto | 70 / 170 / 270 |
| 5 | Assalto na Cozinha | o ladrão (veja abaixo) | 70 / 160 / 250 |

Cada fase libera com 1 estrela na anterior e pode ser jogada em qualquer um dos 6 mapas. O progresso (estrelas e
recorde) é por fase, não por mapa, e fica salvo no navegador.

## O ladrão (fase 5)

Em momentos aleatórios da partida (a cada 22–42 s, no máximo 3 vezes), alguém abre uma porta nos fundos da
cozinha. As luzes caem, sobra só uma luz em volta de cada chef — e do ladrão dá pra ver uma sombra fraca — e um
aviso no topo mostra uma contagem de **10 segundos**.

- Ele anda direto pra uma panela, mas sem tomar o caminho mais curto — hesita, erra o lado, volta.
- Assim que chega nela, pega e sai correndo de volta pra porta.
- Um **taco de beisebol** fica sempre em cima de algum balcão da cozinha (mesma lógica de pegar/soltar do
  extintor). Chegue perto do ladrão de frente e aperte *usar* com o taco na mão pra nocauteá-lo — ele desmaia,
  solta a panela na hora (mesmo se já estiver com ela) e o assalto acaba ali. Isso também rende +15 pontos.
- Se os 10 segundos passarem sem ninguém acertar o taco, ele foge pela porta e **aquele fogão fica sem panela
  pelo resto da partida** (marcado com um X vermelho — não aceita outra panela, nem trazida de outro fogão).

A porta e o taco não fazem parte do mapa: são calculados na hora, então o ladrão pode aparecer em qualquer uma
das 6 cozinhas.

## Estrutura

```
src/
  App.tsx            telas (menu, escolha de mapa, resultado) e progresso salvo
  GameCanvas.tsx     loop do jogo, pausa, ajuste de tela
  ui.tsx             estrelas, controles, prévia do chef e miniatura do mapa
  game/
    types.ts         tipos + TUNING (todos os tempos e velocidades)
    content.ts       receitas e regras das fases
    maps.ts          as 6 arenas: mapa ASCII + tema visual
    avatars.ts       paletas, chapéus e leitura segura do save
    engine.ts        lógica pura: movimento, interação, cozimento, fogo, pedidos
    render.ts        desenho em canvas (cenários, piso, ladrão, luz do assalto)
    input.ts         teclado + Gamepad API
    audio.ts         sons sintetizados (sem arquivos)
scripts/
  validate-maps.mjs  confere as 6 arenas (largura, estações, alcançabilidade, fenda)
  smoke-heist.ts     testa a fase do ladrão e as receitas novas sem navegador
  smoke-arenas.ts    confere porta/taco calculados em cada arena × cada fase
docs/ARQUITETURA.md  decisões técnicas
```

**Fase nova:** adicione um item em `LEVELS` (`src/game/content.ts`) — só regras, sem mapa.

**Receita nova:** adicione um item em `RECIPES` (`src/game/content.ts`) com as `parts` (tokens tipo
`tomato:chopped`) e os `steps` pro ticket. Se usar um ingrediente ainda sem desenho no prato, complete
`drawPlateContents` (`src/game/render.ts`).

**Mapa novo:** adicione um item em `ARENAS` (`src/game/maps.ts`). A legenda está no topo do arquivo. Para o mapa
servir a qualquer fase ele precisa das 5 caixas (`T O L M B`), `K S F W R X Z D P E` e da coluna `~` vedada nas
duas pontas. Um tema novo entra em `ArenaPattern`/`scene` e ganha seu desenho em `drawFloorPattern` e `drawScene`
(`src/game/render.ts`). A porta e o taco do ladrão não entram no mapa — são calculados sozinhos em `createGame`
(`src/game/engine.ts`), então qualquer arena já funciona com a fase 5.
