import { createGame } from '../src/game/engine';
import { LEVELS } from '../src/game/content';
import { ARENAS } from '../src/game/maps';
import { DEFAULT_AVATARS } from '../src/game/avatars';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failed++; console.log('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); }
}

const lv5 = LEVELS.find((l) => l.id === 5)!;
for (const arena of ARENAS) {
  console.log(`\n== ${arena.name} (${arena.id}) ==`);
  const gs = createGame(lv5, arena, false, DEFAULT_AVATARS);
  assert(!!gs.doorTile, 'porta encontrada');
  if (gs.doorTile) {
    const t = gs.tiles[Math.floor(gs.doorTile.y)][Math.floor(gs.doorTile.x)];
    assert(t.type === 'floor', 'porta fica num tile de chão (andável)');
  }
  let bat = 0;
  let pots = 0;
  for (const row of gs.tiles) for (const t of row) {
    if (t.item?.k === 'bat') bat++;
    if (t.type === 'stove' && t.item?.k === 'pot') pots++;
  }
  assert(bat === 1, `exatamente 1 taco colocado (achou ${bat})`);
  assert(pots >= 2, `pelo menos 2 panelas no mapa (achou ${pots})`);
  // também roda a fase 1 normal (sem heist) pra garantir que nada quebrou nas outras fases
  for (const lv of LEVELS.filter((l) => l.id !== 5)) {
    const gs2 = createGame(lv, arena, false, DEFAULT_AVATARS);
    assert(gs2.w > 0 && gs2.h > 0 && gs2.thief === null, `fase ${lv.id} "${lv.name}" cria estado válido nessa arena`);
  }
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo passou.');
process.exit(failed ? 1 : 0);
