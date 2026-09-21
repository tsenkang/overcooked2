// Teste de lógica pura (sem navegador) para a fase do ladrão e as receitas novas.
import { createGame, update, tileAt } from '../src/game/engine';
import { LEVELS, RECIPES, canAddPart, matchRecipe } from '../src/game/content';
import { ARENAS } from '../src/game/maps';
import { DEFAULT_AVATARS } from '../src/game/avatars';
import type { GameState, LevelDef, PadState } from '../src/game/types';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log('  ✗ ' + msg);
  } else {
    console.log('  ✓ ' + msg);
  }
}

const EMPTY: PadState = { mx: 0, my: 0, grab: false, use: false, useHeld: false, dash: false, swap: false };

function tick(gs: GameState, dt: number, n: number, pads: [PadState, PadState] = [EMPTY, EMPTY]) {
  for (let i = 0; i < n; i++) update(gs, dt, pads);
}

function skipCountdown(gs: GameState) {
  let n = 0;
  while (gs.countdown > 0 && n < 500) {
    update(gs, 0.05, [EMPTY, EMPTY]);
    n++;
  }
}

/** Anda até o tile-alvo por um vizinho de chão e olha pra ele — pra doGrab/doUse acharem o target. */
function standNextTo(gs: GameState, tx: number, ty: number) {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ny = ty + dy;
    const nx = tx + dx;
    if (ny < 0 || ny >= gs.h || nx < 0 || nx >= gs.w) continue;
    if (gs.tiles[ny][nx].type !== 'floor') continue;
    const p = gs.players[0];
    p.x = nx + 0.5;
    p.y = ny + 0.5;
    p.dirX = -dx;
    p.dirY = -dy;
    return true;
  }
  return false;
}

// ─── 0) Toda receita precisa aparecer em pelo menos 1 fase, senão é código
//     morto que ninguém nunca vê em jogo (já pegou um bug real assim).
console.log('\n== Receitas × Fases ==');
{
  const used = new Set(LEVELS.flatMap((l) => l.recipes));
  for (const id of Object.keys(RECIPES) as (keyof typeof RECIPES)[]) {
    assert(used.has(id), `RECIPES.${id} ("${RECIPES[id].name}") está em alguma fase`);
  }
}

// ─── 1) Receitas novas: os tokens batem certinho ───────────────────────────
console.log('\n== Receitas ==');
const newRecipes = ['soup_mixed', 'salad_full', 'sandwich_veggie', 'burger_onion', 'burger_deluxe'] as const;
for (const id of newRecipes) {
  const r = RECIPES[id];
  assert(!!r, `RECIPES.${id} existe`);
  assert(matchRecipe(r.parts, [id]) === id, `matchRecipe reconhece ${r.name} pelas suas próprias partes`);
  // adicionando parte por parte (na ordem dos steps) deve sempre ser um prefixo válido
  let acc: string[] = [];
  for (const st of r.steps) {
    const tok = st.tool === 'pot' ? null : `${st.f}:${st.tool === 'pan' ? 'cooked' : st.tool === 'knife' ? 'chopped' : 'raw'}`;
    if (!tok) continue; // sopa: token calculado à parte (soup:xxx), testado abaixo
    assert(canAddPart(acc, tok, [id]), `${r.name}: pode adicionar ${tok} depois de [${acc.join(',')}]`);
    acc.push(tok);
  }
}
assert(matchRecipe(['soup:mixed'], ['soup_mixed']) === 'soup_mixed', 'soup:mixed casa com soup_mixed');
assert(RECIPES.burger_deluxe.parts.length === 5, 'X-Tudo tem 5 partes');

// ─── 2) Nível 4 (mais receitas + fenda) cria estado válido ─────────────────
console.log('\n== Nível 4 ==');
const lv4 = LEVELS.find((l) => l.id === 4)!;
assert(!!lv4 && !!lv4.gap, 'Fase 4 existe e tem fenda');
{
  const gs = createGame(lv4, ARENAS[0], false, DEFAULT_AVATARS);
  assert(gs.w > 0 && gs.h > 0, 'Fase 4 monta tiles');
  skipCountdown(gs);
  assert(gs.orders.length > 0, 'Fase 4: pedido inicial apareceu');
}

// ─── 3) Nível 5 (ladrão): ciclo completo sem intervenção → perde 1 panela ──
console.log('\n== Nível 5: ladrão sem ser parado ==');
{
  const lv5 = LEVELS.find((l) => l.id === 5)!;
  const testLevel: LevelDef = { ...lv5, heist: { minGap: 0.2, maxGap: 0.4, maxThefts: 3 } };
  const gs = createGame(testLevel, ARENAS[2], false, DEFAULT_AVATARS);
  assert(!!gs.doorTile, 'porta calculada para a arena');
  const potsBefore = countPots(gs);
  assert(potsBefore >= 2, `pelo menos 2 panelas no mapa antes do assalto (achou ${potsBefore})`);

  skipCountdown(gs);
  let steps = 0;
  while (!gs.thief && steps < 400) {
    update(gs, 0.02, [EMPTY, EMPTY]);
    steps++;
  }
  assert(gs.thief !== null, 'ladrão apareceu');
  assert(gs.thief!.phase === 'entering', 'ladrão começa na fase "entering"');

  tick(gs, 0.05, 30); // passa da animação de entrada (~0.9s)
  assert(gs.thief!.phase === 'sneaking' || gs.thief!.phase === 'fleeing', 'ladrão passou para sneaking/fleeing');

  // deixa o alarme de 10s todo correr sem nenhum jogador reagir
  tick(gs, 0.1, 130); // 13s
  assert(gs.thief === null, 'ladrão sumiu depois do assalto (sucesso dele)');
  assert(gs.heistCount === 1, `heistCount = 1 (achou ${gs.heistCount})`);
  const potsAfter = countPots(gs);
  assert(potsAfter === potsBefore - 1, `uma panela a menos (antes ${potsBefore}, depois ${potsAfter})`);

  const stolenTile = findStolenTile(gs);
  assert(!!stolenTile, 'um fogão ficou marcado como "stolen"');

  // tenta repor uma panela ali carregando outra panela de outro fogão até o roubado
  const otherPotTile = findPotTile(gs);
  assert(!!otherPotTile, 'sobrou pelo menos 1 fogão com panela pra testar');
  if (otherPotTile && stolenTile) {
    const p = gs.players[0];
    standNextTo(gs, otherPotTile.x, otherPotTile.y);
    tick(gs, 0.016, 1);
    // pega a panela do outro fogão
    tick(gs, 0.016, 1, [{ ...EMPTY, grab: true }, EMPTY]);
    assert(p.held?.k === 'pot', 'jogador pegou uma panela de outro fogão');
    // anda até o fogão roubado e tenta largar lá
    standNextTo(gs, stolenTile.x, stolenTile.y);
    tick(gs, 0.016, 1);
    tick(gs, 0.016, 1, [{ ...EMPTY, grab: true }, EMPTY]);
    const tileNow = tileAt(gs, stolenTile.x + 0.5, stolenTile.y + 0.5)!;
    assert(tileNow.item === null, 'fogão roubado continua sem panela (não aceita reposição)');
    assert(p.held?.k === 'pot', 'jogador continua com a panela na mão (a colocação foi recusada)');
  }
}

function countPots(gs: GameState): number {
  let n = 0;
  for (const row of gs.tiles) for (const t of row) if (t.type === 'stove' && t.item?.k === 'pot') n++;
  return n;
}
function findStolenTile(gs: GameState) {
  for (const row of gs.tiles) for (const t of row) if (t.stolen) return t;
  return null;
}
function findPotTile(gs: GameState) {
  for (const row of gs.tiles) for (const t of row) if (t.type === 'stove' && t.item?.k === 'pot') return t;
  return null;
}

// ─── 4) Nível 5: nocauteando o ladrão com o taco ───────────────────────────
console.log('\n== Nível 5: nocauteando o ladrão ==');
{
  const lv5 = LEVELS.find((l) => l.id === 5)!;
  const testLevel: LevelDef = { ...lv5, heist: { minGap: 0.2, maxGap: 0.4, maxThefts: 3 } };
  const gs = createGame(testLevel, ARENAS[4], false, DEFAULT_AVATARS);
  const potsBefore = countPots(gs);

  // acha o taco no mapa
  let batTile = null as null | { x: number; y: number };
  for (const row of gs.tiles) for (const t of row) if (t.item?.k === 'bat') batTile = { x: t.x, y: t.y };
  assert(!!batTile, 'taco de beisebol foi colocado em algum balcão');

  skipCountdown(gs);
  let steps2 = 0;
  while (!gs.thief && steps2 < 400) {
    update(gs, 0.02, [EMPTY, EMPTY]);
    steps2++;
  }
  tick(gs, 0.05, 30); // sai de "entering"
  assert(gs.thief!.phase !== 'entering', 'ladrão já está solto na cozinha');

  const p = gs.players[0];
  if (batTile) {
    standNextTo(gs, batTile.x, batTile.y);
    tick(gs, 0.016, 1);
    tick(gs, 0.016, 1, [{ ...EMPTY, grab: true }, EMPTY]);
  }
  assert(p.held?.k === 'bat', 'jogador pegou o taco');

  // persegue o ladrão por alguns segundos (segue a posição dele a cada passo)
  let stunned = false;
  for (let i = 0; i < 400 && !stunned; i++) {
    const th = gs.thief;
    if (!th) break;
    const dx = th.x - p.x;
    const dy = th.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) {
      p.dirX = dx / d;
      p.dirY = dy / d;
    }
    if (d > 0.5) {
      p.x += (dx / (d || 1)) * 4 * 0.03;
      p.y += (dy / (d || 1)) * 4 * 0.03;
    }
    tick(gs, 0.03, 1, [{ ...EMPTY, use: d <= 1.0 }, EMPTY]);
    if (gs.thief?.phase === 'stunned') stunned = true;
  }
  assert(stunned, 'o taco nocauteou o ladrão dentro do tempo de perseguição simulado');
  assert(gs.score >= 15, `pontuação subiu com o nocaute (score=${gs.score})`);
  const potsDuring = countPots(gs);
  assert(potsDuring === potsBefore, 'nenhuma panela foi perdida (pego antes de sair pela porta)');

  // espera só o tempo de ficar desacordado passar (o próximo assalto pode vir
  // logo em seguida, já que este teste usa um intervalo bem curto de propósito)
  let n3 = 0;
  while (gs.thief?.phase === 'stunned' && n3 < 200) {
    update(gs, 0.02, [EMPTY, EMPTY]);
    n3++;
  }
  assert(gs.thief === null, 'ladrão some assim que o nocaute termina');
  assert(gs.heistCount === 0, 'esse assalto não conta como sucesso do ladrão');
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo passou.');
process.exit(failed ? 1 : 0);
