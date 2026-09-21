import { readFileSync } from 'fs';
const src = readFileSync('src/game/maps.ts', 'utf8');
// extract id + map arrays
const arenas = [];
const re = /id:\s*'([a-z]+)'[\s\S]*?map:\s*\[([\s\S]*?)\]/g;
let m;
while ((m = re.exec(src))) {
  const rows = [...m[2].matchAll(/'([^']*)'/g)].map(r => r[1]);
  arenas.push({ id: m[1], rows });
}
const REQUIRED = 'TOLMBKSFWRXZDPE12'.split('');
const WALK = new Set(['.', '1', '2']);           // floor
const GAPC = '~';
let fail = 0;
const err = (id, msg) => { console.log(`  ✗ [${id}] ${msg}`); fail++; };

for (const a of arenas) {
  const h = a.rows.length, w = a.rows[0].length;
  console.log(`\n${a.id}  ${w}x${h}`);
  a.rows.forEach((r, y) => { if (r.length !== w) err(a.id, `linha ${y} tem ${r.length} col (esperado ${w})`); });
  const all = a.rows.join('');
  for (const c of REQUIRED) if (!all.includes(c)) err(a.id, `falta o caractere '${c}'`);
  for (const c of ['1','2']) if ((all.match(new RegExp(c,'g'))||[]).length !== 1) err(a.id, `'${c}' deve aparecer 1x`);

  const at = (x,y) => (y<0||y>=h||x<0||x>=w) ? ' ' : a.rows[y][x];
  // flood fill from spawn 1, gap CLOSED (gap walkable)
  const flood = (gapOpen) => {
    let s1;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (at(x,y)==='1') s1={x,y};
    const ok = (c) => WALK.has(c) || (c===GAPC && !gapOpen);
    const seen = new Set([`${s1.x},${s1.y}`]); const q=[s1];
    while(q.length){ const p=q.pop();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=p.x+dx, ny=p.y+dy, k=`${nx},${ny}`;
        if(seen.has(k)) continue; if(!ok(at(nx,ny))) continue; seen.add(k); q.push({x:nx,y:ny}); } }
    return seen;
  };
  const closed = flood(false);
  // spawn 2 reachable when closed
  let s2; for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(at(x,y)==='2') s2={x,y};
  if (!closed.has(`${s2.x},${s2.y}`)) err(a.id, 'chef 2 nao alcanca chef 1 com a fenda fechada');

  // every station orthogonally adjacent to a reachable floor tile
  const STATION = 'KSFWRXZDPE TOLMB#'.split('').filter(c=>c!==' '&&c!=='#');
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const c = at(x,y);
    if (!STATION.includes(c)) continue;
    const adj = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => closed.has(`${x+dx},${y+dy}`));
    if (!adj) err(a.id, `estacao '${c}' em (${x},${y}) nao encosta em chao alcancavel`);
  }
  // void tiles must not touch reachable floor (nobody falls in the sea by accident)
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    if (at(x,y) !== ' ') continue;
    const adj = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => closed.has(`${x+dx},${y+dy}`));
    if (adj) err(a.id, `vazio em (${x},${y}) encosta no chao jogavel`);
  }
  // gap column: contiguous, sealed top and bottom, and actually splits the room when open
  const gapCols = new Set(); for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(at(x,y)===GAPC) gapCols.add(x);
  if (gapCols.size === 0) err(a.id, 'sem tiles de fenda');
  const open = flood(true);
  if (open.has(`${s2.x},${s2.y}`)) err(a.id, 'a fenda aberta NAO separa os dois chefs');
  const leftN = open.size, rightN = (()=>{ // flood from spawn2 with gap open
    const ok=(c)=>WALK.has(c); const seen=new Set([`${s2.x},${s2.y}`]); const q=[s2];
    while(q.length){const p=q.pop(); for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=p.x+dx,ny=p.y+dy,k=`${nx},${ny}`;
      if(seen.has(k))continue; if(!ok(at(nx,ny)))continue; seen.add(k); q.push({x:nx,y:ny});}} return seen.size;})();
  console.log(`  fenda col ${[...gapCols].join(',')} · lados ${leftN}/${rightN} tiles`);
  // each side must have at least a crate and a board reachable
  for (const [side, set, nm] of [[0, open, 'esq'], [1, null, 'dir']]) {
    const reach = side===0 ? open : (()=>{const ok=(c)=>WALK.has(c); const seen=new Set([`${s2.x},${s2.y}`]); const q=[s2];
      while(q.length){const p=q.pop(); for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=p.x+dx,ny=p.y+dy,k=`${nx},${ny}`;
        if(seen.has(k))continue; if(!ok(at(nx,ny)))continue; seen.add(k); q.push({x:nx,y:ny});}} return seen;})();
    const touching = new Set();
    for (const key of reach) { const [x,y]=key.split(',').map(Number);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) touching.add(at(x+dx,y+dy)); }
    const hasCrate = ['T','O','L','M','B'].some(c=>touching.has(c));
    const hasBoard = touching.has('K');
    if (!hasCrate) err(a.id, `lado ${nm} sem nenhuma caixa de ingrediente com a fenda aberta`);
    if (!hasBoard) err(a.id, `lado ${nm} sem tabua com a fenda aberta`);
  }
}
console.log(fail ? `\n${fail} problema(s)` : `\nOK — ${arenas.length} arenas validas`);
process.exit(fail?1:0);
