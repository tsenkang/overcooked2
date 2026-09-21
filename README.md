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
```

## Controles

| Ação | Chef 1 | Chef 2 | Controle |
|---|---|---|---|
| Andar | W A S D | Setas | Analógico / D-pad |
| Pegar / soltar | Espaço | Enter (ou K) | A |
| Cortar · lavar · jogar · extintor | E | Shift direito (ou L) | X |
| Correr (dash) | Shift esquerdo | Ctrl direito (ou ;) | B |
| Trocar de chef (modo 1 jogador) | Q ou Tab | — | LB / RB |
| Pausa | Esc ou P | Esc ou P | Start |

## Como funciona

1. **Caixas de madeira** dão ingredientes infinitos.
2. **Tábua**: solte o ingrediente e aperte *usar* para cortar (o chef continua cortando até você andar).
3. **Panela**: 3 ingredientes picados iguais viram sopa. **Frigideira**: carne picada vira hambúrguer.
4. Passou do ponto → o ícone **!** pisca → queima → **pega fogo** e o fogo se espalha. Use o **extintor** (segure *usar*).
5. **Monte no prato** (dá para levar o prato até a panela ou a panela até o prato) e entregue na **ENTREGA**.
6. Pratos voltam pela janela **PRATOS** alguns segundos depois. Nas fases 2 e 3 voltam **sujos**: lave na **pia** e pegue no escorredor.
7. Com um ingrediente na mão, *usar* **arremessa** ele. Ele cai em bancadas, panelas e pratos — e o outro chef pode pegar no ar.
8. **Gorjeta**: quanto mais rápido, maior. Entregar na ordem dos pedidos multiplica a gorjeta (até x4). Pedido vencido = −10.

## Fases

| # | Nome | Novidade | Estrelas |
|---|---|---|---|
| 1 | Sopa na Serra | panela, fogo, extintor | 60 / 140 / 220 |
| 2 | Lanchonete do Porto | frigideira, salada, pratos sujos e pia | 60 / 150 / 240 |
| 3 | Cozinha Rachada | o chão do meio abre de tempos em tempos (quem cai renasce em 5 s) | 50 / 130 / 210 |

Cada fase libera com 1 estrela na anterior. O progresso fica salvo no navegador.

## Estrutura

```
src/
  App.tsx            telas (menu, resultado) e progresso salvo
  GameCanvas.tsx     loop do jogo, pausa, ajuste de tela
  ui.tsx             estrelas e tabela de controles
  game/
    types.ts         tipos + TUNING (todos os tempos e velocidades)
    content.ts       receitas e mapas das fases (ASCII)
    engine.ts        lógica pura: movimento, interação, cozimento, fogo, pedidos
    render.ts        desenho em canvas
    input.ts         teclado + Gamepad API
    audio.ts         sons sintetizados (sem arquivos)
docs/ARQUITETURA.md  decisões técnicas
```

Para criar uma fase nova, adicione um item em `LEVELS` (`src/game/content.ts`) — a legenda do mapa está no próprio arquivo.
