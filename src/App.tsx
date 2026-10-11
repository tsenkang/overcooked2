import { useEffect, useState } from 'react';
import GameCanvas, { type Result } from './GameCanvas';
import { sfx } from './game/audio';
import { ACCENT_COLORS, BODY_COLORS, DEFAULT_AVATARS, HATS, SKIN_TONES, sanitizeAvatar } from './game/avatars';
import { LEVELS, RECIPES, SURVIVAL_LEVEL, WORLDS, ZEN_LEVEL, worldOf } from './game/content';
import { ARENAS } from './game/maps';
import type { ArenaDef, Avatar, LevelDef } from './game/types';
import { ArenaThumb, AvatarCanvas, Controls, Stars, Swatches } from './ui';

type Screen =
  | { name: 'menu' }
  | { name: 'pick'; level: LevelDef }
  | { name: 'play'; level: LevelDef; arena: ArenaDef; run: number }
  | { name: 'result'; result: Result };

type Progress = Record<number, { stars: number; best: number }>;
type Pair = [Avatar, Avatar];

const SAVE_KEY = 'panelaco:progress:v1';
const AVATAR_KEY = 'panelaco:avatars:v1';
const ARENA_KEY = 'panelaco:arena:v1';

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') as Progress;
  } catch {
    return {};
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o jogo segue funcionando */
  }
}
function loadAvatars(): Pair {
  try {
    const raw = JSON.parse(localStorage.getItem(AVATAR_KEY) || 'null') as unknown;
    const arr = Array.isArray(raw) ? raw : [];
    return [sanitizeAvatar(arr[0], DEFAULT_AVATARS[0]), sanitizeAvatar(arr[1], DEFAULT_AVATARS[1])];
  } catch {
    return [{ ...DEFAULT_AVATARS[0] }, { ...DEFAULT_AVATARS[1] }];
  }
}
function loadArena(): ArenaDef {
  try {
    const id = JSON.parse(localStorage.getItem(ARENA_KEY) || 'null');
    return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
  } catch {
    return ARENAS[0];
  }
}

let runCounter = 0;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [solo, setSolo] = useState(false);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [avatars, setAvatars] = useState<Pair>(loadAvatars);
  const [lastArena, setLastArena] = useState<ArenaDef>(loadArena);
  const [openWorld, setOpenWorld] = useState<number>(() => {
    const p = loadProgress();
    const frontier = LEVELS.find((lv) => (p[lv.id]?.stars ?? 0) < 1) ?? LEVELS[LEVELS.length - 1];
    return worldOf(frontier.id);
  });

  const setAvatar = (i: 0 | 1, patch: Partial<Avatar>) => {
    const next: Pair = i === 0 ? [{ ...avatars[0], ...patch }, avatars[1]] : [avatars[0], { ...avatars[1], ...patch }];
    setAvatars(next);
    save(AVATAR_KEY, next);
  };

  const play = (level: LevelDef, arena: ArenaDef) => {
    setLastArena(arena);
    save(ARENA_KEY, arena.id);
    setScreen({ name: 'play', level, arena, run: ++runCounter });
  };

  const finish = (r: Result) => {
    const prev = progress[r.level.id];
    // na sobrevivência o "recorde" é tempo sobrevivido, não pontuação
    const bestValue = r.level.endless ? r.time : r.score;
    const next: Progress = {
      ...progress,
      [r.level.id]: { stars: Math.max(prev?.stars ?? 0, r.stars), best: Math.max(prev?.best ?? 0, bestValue) },
    };
    setProgress(next);
    save(SAVE_KEY, next);
    setScreen({ name: 'result', result: r });
  };

  if (screen.name === 'play') {
    return (
      <GameCanvas
        key={screen.run}
        level={screen.level}
        arena={screen.arena}
        avatars={avatars}
        solo={solo}
        onFinish={finish}
        onQuit={() => setScreen({ name: 'menu' })}
      />
    );
  }

  if (screen.name === 'pick') {
    return (
      <MapPicker
        level={screen.level}
        current={lastArena}
        onPick={(a) => play(screen.level, a)}
        onBack={() => setScreen({ name: 'menu' })}
      />
    );
  }

  if (screen.name === 'result') {
    const r = screen.result;
    return (
      <ResultScreen
        r={r}
        best={progress[r.level.id]?.best ?? 0}
        onRetry={() => play(r.level, r.arena)}
        onChangeMap={() => setScreen({ name: 'pick', level: r.level })}
        onNext={() => {
          const nxt = LEVELS.find((l) => l.id === r.level.id + 1);
          if (nxt) setScreen({ name: 'pick', level: nxt });
          else setScreen({ name: 'menu' });
        }}
        onMenu={() => setScreen({ name: 'menu' })}
      />
    );
  }

  return (
    <main className="min-h-screen tile-bg text-[#2b1d16]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <p className="font-display text-sm font-extrabold tracking-[0.3em] text-[#fff4dc]/80 uppercase">
            cozinha cooperativa · 1 ou 2 chefs
          </p>
          <h1 className="font-display title-3d mt-2 text-7xl sm:text-8xl font-black leading-none">PANELAÇO!</h1>
          <p className="mt-4 text-lg text-[#fff4dc]/90 max-w-xl mx-auto">
            Pique, cozinhe, monte e entregue antes do pedido vencer. A cozinha vai pegar fogo — às vezes, de verdade.
          </p>
        </header>

        <section className="mt-8 flex justify-center" aria-label="Modo de jogo">
          <div className="inline-flex flex-wrap justify-center rounded-full bg-black/30 p-1.5" role="radiogroup">
            {[
              { v: false, l: '2 jogadores' },
              { v: true, l: '1 jogador (troca de chef)' },
            ].map((o) => (
              <button
                key={o.l}
                role="radio"
                aria-checked={solo === o.v}
                onClick={() => setSolo(o.v)}
                className={`rounded-full px-5 py-2.5 font-bold transition-colors ${
                  solo === o.v ? 'bg-[#ffd23f] text-[#2b1d16]' : 'text-[#fff4dc] hover:bg-white/10'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8" aria-label="Personalizar os chefs">
          <h2 className="font-display text-3xl font-black text-[#fff4dc] text-center">Seus chefs</h2>
          <p className="text-center text-sm text-[#fff4dc]/80 mt-1">
            As escolhas valem no jogo e ficam salvas neste navegador.
          </p>
          <div className={`mt-4 grid gap-4 ${solo ? '' : 'md:grid-cols-2'}`}>
            {([0, 1] as const).map((i) =>
              solo && i === 1 ? null : (
                <AvatarEditor key={i} index={i} avatar={avatars[i]} onChange={(p) => setAvatar(i, p)} />
              ),
            )}
          </div>
        </section>

        <section className="mt-10" aria-label="Fases">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="font-display text-3xl font-black text-[#fff4dc]">Campanha</h2>
            <p className="text-sm text-[#fff4dc]/80">30 fases em 6 mundos — clique num mundo pra abrir.</p>
          </div>
          <div className="mt-4 grid gap-3">
            {WORLDS.map((world, wi) => {
              const levels = LEVELS.filter((lv) => lv.id >= world.from && lv.id <= world.to);
              const worldStars = levels.reduce((s, lv) => s + (progress[lv.id]?.stars ?? 0), 0);
              const worldMax = levels.length * 3;
              const open = openWorld === wi;
              const prevWorldDone = world.from === 1 || (progress[world.from - 1]?.stars ?? 0) >= 1;
              return (
                <div key={world.name} className="rounded-3xl bg-[#fffaf0] overflow-hidden shadow-[0_8px_0_rgba(0,0,0,0.25)]">
                  <button
                    onClick={() => setOpenWorld(open ? -1 : wi)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#2b1d16]/5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">
                        Mundo {wi + 1} · fases {world.from}–{world.to}
                      </p>
                      <h3 className="font-display text-xl font-black leading-tight truncate">{world.name}</h3>
                      <p className="text-sm text-[#6b5446] truncate">{world.tagline}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <span className="text-sm font-bold text-[#8a6f5e]">★ {worldStars}/{worldMax}</span>
                      <span className={`text-2xl transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
                        ⌄
                      </span>
                    </div>
                  </button>
                  {open && (
                    <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
                      {!prevWorldDone && (
                        <p className="sm:col-span-2 lg:col-span-3 text-sm text-[#8a6f5e] -mt-1">
                          Ganhe 1 estrela no mundo anterior pra destravar essas fases.
                        </p>
                      )}
                      {levels.map((lv) => {
                        const i = LEVELS.findIndex((l) => l.id === lv.id);
                        const locked = i > 0 && (progress[LEVELS[i - 1].id]?.stars ?? 0) < 1;
                        const pr = progress[lv.id];
                        return (
                          <article
                            key={lv.id}
                            className={`relative rounded-2xl bg-white p-5 shadow-[0_6px_0_rgba(0,0,0,0.15)] flex flex-col ${
                              locked ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="h-2 rounded-full mb-4 bg-[#c2703f]" />
                            <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">Fase {lv.id}</p>
                            <h2 className="font-display text-2xl font-black leading-tight">{lv.name}</h2>
                            <p className="mt-1 text-sm text-[#6b5446] flex-1">{lv.subtitle}</p>
                            <p className="mt-3 text-xs text-[#6b5446]">
                              <b>Pratos:</b> {lv.recipes.map((r) => RECIPES[r].name).join(', ')}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <Stars n={pr?.stars ?? 0} size="text-2xl" />
                              <span className="text-xs text-[#8a6f5e]">
                                {pr ? `recorde ${pr.best}` : `${lv.stars.join(' / ')} pts`}
                              </span>
                            </div>
                            <button
                              disabled={locked}
                              onClick={() => setScreen({ name: 'pick', level: lv })}
                              className="btn-primary mt-4 disabled:cursor-not-allowed"
                            >
                              {locked ? 'Ganhe 1 estrela na anterior' : 'Escolher mapa'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10" aria-label="Outros modos">
          <h2 className="font-display text-3xl font-black text-[#fff4dc] text-center">Outros modos</h2>
          <p className="text-center text-sm text-[#fff4dc]/80 mt-1">Fora da campanha — não precisam de estrela pra destravar.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl bg-[#fffaf0] p-5 shadow-[0_8px_0_rgba(0,0,0,0.25)] flex flex-col">
              <div className="h-2 rounded-full mb-4 bg-[#3ec46d]" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">Sem pressão</p>
              <h3 className="font-display text-2xl font-black leading-tight">{ZEN_LEVEL.name}</h3>
              <p className="mt-1 text-sm text-[#6b5446] flex-1">{ZEN_LEVEL.subtitle}</p>
              <button onClick={() => setScreen({ name: 'pick', level: ZEN_LEVEL })} className="btn-primary mt-4">
                Jogar modo livre
              </button>
            </article>
            <article className="rounded-3xl bg-[#fffaf0] p-5 shadow-[0_8px_0_rgba(0,0,0,0.25)] flex flex-col">
              <div className="h-2 rounded-full mb-4 bg-[#ef4444]" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">
                {progress[SURVIVAL_LEVEL.id]?.best
                  ? `recorde ${Math.floor((progress[SURVIVAL_LEVEL.id]?.best ?? 0) / 60)}:${String(
                      Math.floor(progress[SURVIVAL_LEVEL.id]?.best ?? 0) % 60,
                    ).padStart(2, '0')}`
                  : 'até quanto você aguenta?'}
              </p>
              <h3 className="font-display text-2xl font-black leading-tight">{SURVIVAL_LEVEL.name}</h3>
              <p className="mt-1 text-sm text-[#6b5446] flex-1">{SURVIVAL_LEVEL.subtitle}</p>
              <button onClick={() => setScreen({ name: 'pick', level: SURVIVAL_LEVEL })} className="btn-primary mt-4">
                Jogar sobrevivência
              </button>
            </article>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-[#fffaf0] p-5">
            <h2 className="font-display text-2xl font-black">Como jogar</h2>
            <ol className="mt-3 space-y-2 text-sm">
              <li><b>1. Pegue</b> o ingrediente na caixa de madeira.</li>
              <li><b>2. Corte</b> na tábua: solte ali e aperte o botão de usar.</li>
              <li><b>3. Cozinhe:</b> sopa leva 3 iguais na panela; carne vai na frigideira.</li>
              <li><b>4. Monte</b> no prato e leve até a <b>ENTREGA</b>.</li>
              <li><b>5. Lave</b> os pratos sujos na pia (fases 2 e 3).</li>
            </ol>
            <p className="mt-3 text-sm text-[#6b5446]">
              Panela piscando <b className="text-[#c81e1e]">!</b> = vai queimar. Se pegar fogo, pegue o <b>extintor</b> e
              segure o botão de usar. Entregar na ordem dos pedidos aumenta a <b>gorjeta</b> (até x4). Com um
              ingrediente na mão, o botão de usar <b>joga</b> ele pra frente.
            </p>
          </div>
          <div className="rounded-3xl bg-[#fffaf0] p-5">
            <h2 className="font-display text-2xl font-black">Controles</h2>
            <div className="mt-3">
              <Controls solo={solo} names={[avatars[0].name, avatars[1].name]} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─── Personalização ─────────────────────────────────────────────────────────
function AvatarEditor({
  index, avatar, onChange,
}: { index: 0 | 1; avatar: Avatar; onChange: (patch: Partial<Avatar>) => void }) {
  const nameId = `chef-nome-${index}`;
  return (
    <article className="rounded-3xl bg-[#fffaf0] p-5 shadow-[0_8px_0_rgba(0,0,0,0.25)]">
      <div className="flex gap-4">
        <div className="shrink-0 rounded-2xl bg-[#2b1d16]/5 p-1">
          <AvatarCanvas look={avatar} size={120} />
        </div>
        <div className="flex-1 min-w-0">
          <label htmlFor={nameId} className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">
            Chef {index + 1}
          </label>
          <input
            id={nameId}
            value={avatar.name}
            maxLength={14}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 w-full rounded-xl border-2 border-[#2b1d16]/15 bg-white px-3 py-2 font-display text-xl font-black focus:border-[#ffc72c] focus:outline-none"
          />
          <div className="mt-3">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">Chapéu</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chapéu">
              {HATS.map((h) => (
                <button
                  key={h.id}
                  role="radio"
                  aria-checked={avatar.hat === h.id}
                  onClick={() => onChange({ hat: h.id })}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    avatar.hat === h.id ? 'bg-[#ffd23f] text-[#2b1d16]' : 'bg-[#2b1d16]/8 text-[#6b5446] hover:bg-[#2b1d16]/15'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Swatches label="Uniforme" value={avatar.body} options={BODY_COLORS} onChange={(body) => onChange({ body })} />
        <Swatches label="Chapéu" value={avatar.accent} options={ACCENT_COLORS} onChange={(accent) => onChange({ accent })} />
        <Swatches label="Pele" value={avatar.skin} options={SKIN_TONES} onChange={(skin) => onChange({ skin })} />
      </div>
    </article>
  );
}

// ─── Escolha do mapa ────────────────────────────────────────────────────────
function MapPicker({
  level, current, onPick, onBack,
}: { level: LevelDef; current: ArenaDef; onPick: (a: ArenaDef) => void; onBack: () => void }) {
  const [sel, setSel] = useState<ArenaDef>(current);
  return (
    <main className="min-h-screen tile-bg text-[#2b1d16]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="text-center">
          <p className="font-display text-sm font-extrabold tracking-[0.3em] text-[#fff4dc]/80 uppercase">
            {level.id >= 1 && level.id <= 30 ? `Fase ${level.id} · ` : ''}
            {level.name}
          </p>
          <h1 className="font-display title-3d mt-2 text-5xl sm:text-6xl font-black leading-none">ESCOLHA A COZINHA</h1>
          <p className="mt-3 text-[#fff4dc]/90 max-w-2xl mx-auto">
            Toda cozinha tem as mesmas estações — muda o formato do salão e o país. As regras da fase continuam as
            mesmas em qualquer uma.
          </p>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Mapas">
          {ARENAS.map((a) => {
            const on = sel.id === a.id;
            return (
              <article
                key={a.id}
                className={`rounded-3xl bg-[#fffaf0] p-4 shadow-[0_8px_0_rgba(0,0,0,0.25)] transition-transform ${
                  on ? 'ring-4 ring-[#ffd23f] -translate-y-1' : ''
                }`}
              >
                <button
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSel(a)}
                  onDoubleClick={() => onPick(a)}
                  className="w-full text-left"
                >
                  <ArenaThumb arena={a} w={280} h={186} />
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl leading-none">{a.flag}</span>
                    <h2 className="font-display text-xl font-black leading-tight">{a.name}</h2>
                  </div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">{a.region}</p>
                  <p className="mt-1 text-sm text-[#6b5446]">{a.subtitle}</p>
                  <p className="mt-2 text-lg" aria-hidden="true">{a.props.join(' ')}</p>
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn-primary sm:px-10" onClick={() => onPick(sel)}>
            Cozinhar em {sel.flag} {sel.name}
          </button>
          <button className="btn-ghost" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    </main>
  );
}

// ─── Resultado ──────────────────────────────────────────────────────────────
function ResultScreen({
  r, best, onRetry, onChangeMap, onNext, onMenu,
}: {
  r: Result; best: number; onRetry: () => void; onChangeMap: () => void; onNext: () => void; onMenu: () => void;
}) {
  const [lit, setLit] = useState(0);
  const isCampaign = r.level.id >= 1 && r.level.id <= 30;
  const isSurvival = !!r.level.endless;
  const canNext = isCampaign && LEVELS.some((l) => l.id === r.level.id + 1) && r.stars > 0;

  useEffect(() => {
    if (!isCampaign) return;
    const timers = [0, 1, 2].map((i) =>
      window.setTimeout(() => {
        if (i < r.stars) sfx.star();
        setLit(i + 1);
      }, 500 + i * 450),
    );
    return () => timers.forEach(clearTimeout);
  }, [r.stars, isCampaign]);

  const survivedTime = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time) % 60).padStart(2, '0')}`;

  return (
    <main className="min-h-screen tile-bg flex items-center justify-center p-4 text-[#2b1d16]">
      <div className="w-full max-w-md rounded-3xl bg-[#fffaf0] p-8 text-center shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">
          {isCampaign ? `Fase ${r.level.id} · ` : ''}
          {r.arena.flag} {r.arena.name}
        </p>
        <h1 className="font-display text-4xl font-black">{r.level.name}</h1>
        {isCampaign ? (
          <div className="mt-4 flex justify-center">
            <Stars n={r.stars} lit={lit} size="text-6xl" />
          </div>
        ) : isSurvival ? (
          <p className="font-display title-3d mt-4 text-5xl font-black">{survivedTime}</p>
        ) : null}
        <p className="font-display mt-2 text-6xl font-black tabular-nums">{r.score}</p>
        {isCampaign ? (
          <p className="text-sm text-[#6b5446]">
            {r.stars === 0 ? `Faltaram ${r.level.stars[0] - r.score} pontos para a 1ª estrela` : `Recorde: ${best}`}
          </p>
        ) : (
          <p className="text-sm text-[#6b5446]">
            {isSurvival
              ? `Recorde: ${Math.floor(best / 60)}:${String(Math.floor(best) % 60).padStart(2, '0')}`
              : `Recorde: ${best}`}
          </p>
        )}
        <dl className="mt-6 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl bg-[#2b1d16]/5 p-3">
            <dt className="text-[#6b5446]">Entregues</dt>
            <dd className="font-display text-2xl font-black">{r.delivered}</dd>
          </div>
          <div className="rounded-2xl bg-[#2b1d16]/5 p-3">
            <dt className="text-[#6b5446]">Perdidos</dt>
            <dd className="font-display text-2xl font-black">{r.failed}</dd>
          </div>
          <div className="rounded-2xl bg-[#2b1d16]/5 p-3">
            <dt className="text-[#6b5446]">Gorjetas</dt>
            <dd className="font-display text-2xl font-black">{r.tips}</dd>
          </div>
        </dl>
        {isCampaign && <p className="mt-4 text-xs text-[#8a6f5e]">Estrelas em {r.level.stars.join(' · ')} pontos</p>}
        <div className="mt-6 grid gap-3">
          {canNext && (
            <button className="btn-primary" onClick={onNext}>
              Próxima fase
            </button>
          )}
          <button className={canNext ? 'btn-secondary' : 'btn-primary'} onClick={onRetry}>
            Jogar de novo
          </button>
          <button className="btn-secondary" onClick={onChangeMap}>
            Trocar de mapa
          </button>
          <button className="btn-ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </main>
  );
}
