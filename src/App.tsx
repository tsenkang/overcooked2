import { useEffect, useState } from 'react';
import GameCanvas, { type Result } from './GameCanvas';
import { sfx } from './game/audio';
import { LEVELS, RECIPES } from './game/content';
import type { LevelDef } from './game/types';
import { Controls, Stars } from './ui';

type Screen = { name: 'menu' } | { name: 'play'; level: LevelDef; run: number } | { name: 'result'; result: Result };
type Progress = Record<number, { stars: number; best: number }>;

const SAVE_KEY = 'panelaco:progress:v1';

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') as Progress;
  } catch {
    return {};
  }
}
function saveProgress(p: Progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: o jogo segue funcionando */
  }
}

let runCounter = 0;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [solo, setSolo] = useState(false);
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const play = (level: LevelDef) => setScreen({ name: 'play', level, run: ++runCounter });

  const finish = (r: Result) => {
    const prev = progress[r.level.id];
    const next: Progress = {
      ...progress,
      [r.level.id]: { stars: Math.max(prev?.stars ?? 0, r.stars), best: Math.max(prev?.best ?? 0, r.score) },
    };
    setProgress(next);
    saveProgress(next);
    setScreen({ name: 'result', result: r });
  };

  if (screen.name === 'play') {
    return (
      <GameCanvas
        key={screen.run}
        level={screen.level}
        solo={solo}
        onFinish={finish}
        onQuit={() => setScreen({ name: 'menu' })}
      />
    );
  }

  if (screen.name === 'result') {
    const r = screen.result;
    return (
      <ResultScreen
        r={r}
        best={progress[r.level.id]?.best ?? 0}
        onRetry={() => play(r.level)}
        onNext={() => {
          const nxt = LEVELS.find((l) => l.id === r.level.id + 1);
          if (nxt) play(nxt);
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

        <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Fases">
          {LEVELS.map((lv, i) => {
            const locked = i > 0 && (progress[LEVELS[i - 1].id]?.stars ?? 0) < 1;
            const pr = progress[lv.id];
            return (
              <article
                key={lv.id}
                className={`relative rounded-3xl bg-[#fffaf0] p-5 shadow-[0_8px_0_rgba(0,0,0,0.25)] flex flex-col ${
                  locked ? 'opacity-60' : ''
                }`}
              >
                <div className="h-2 rounded-full mb-4" style={{ background: lv.wall }} />
                <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">Fase {lv.id}</p>
                <h2 className="font-display text-2xl font-black leading-tight">{lv.name}</h2>
                <p className="mt-1 text-sm text-[#6b5446] flex-1">{lv.subtitle}</p>
                <p className="mt-3 text-xs text-[#6b5446]">
                  <b>Pratos:</b> {lv.recipes.map((r) => RECIPES[r].name).join(', ')}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <Stars n={pr?.stars ?? 0} size="text-2xl" />
                  <span className="text-xs text-[#8a6f5e]">{pr ? `recorde ${pr.best}` : `${lv.stars.join(' / ')} pts`}</span>
                </div>
                <button disabled={locked} onClick={() => play(lv)} className="btn-primary mt-4 disabled:cursor-not-allowed">
                  {locked ? 'Ganhe 1 estrela na anterior' : 'Jogar'}
                </button>
              </article>
            );
          })}
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
              <Controls solo={solo} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ResultScreen({
  r, best, onRetry, onNext, onMenu,
}: { r: Result; best: number; onRetry: () => void; onNext: () => void; onMenu: () => void }) {
  const [lit, setLit] = useState(0);
  const canNext = LEVELS.some((l) => l.id === r.level.id + 1) && r.stars > 0;

  useEffect(() => {
    const timers = [0, 1, 2].map((i) =>
      window.setTimeout(() => {
        if (i < r.stars) sfx.star();
        setLit(i + 1);
      }, 500 + i * 450),
    );
    return () => timers.forEach(clearTimeout);
  }, [r.stars]);

  return (
    <main className="min-h-screen tile-bg flex items-center justify-center p-4 text-[#2b1d16]">
      <div className="w-full max-w-md rounded-3xl bg-[#fffaf0] p-8 text-center shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#8a6f5e]">Fase {r.level.id}</p>
        <h1 className="font-display text-4xl font-black">{r.level.name}</h1>
        <div className="mt-4 flex justify-center">
          <Stars n={r.stars} lit={lit} size="text-6xl" />
        </div>
        <p className="font-display mt-2 text-6xl font-black tabular-nums">{r.score}</p>
        <p className="text-sm text-[#6b5446]">
          {r.stars === 0 ? `Faltaram ${r.level.stars[0] - r.score} pontos para a 1ª estrela` : `Recorde: ${best}`}
        </p>
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
        <p className="mt-4 text-xs text-[#8a6f5e]">Estrelas em {r.level.stars.join(' · ')} pontos</p>
        <div className="mt-6 grid gap-3">
          {canNext && (
            <button className="btn-primary" onClick={onNext}>
              Próxima fase
            </button>
          )}
          <button className={canNext ? 'btn-secondary' : 'btn-primary'} onClick={onRetry}>
            Jogar de novo
          </button>
          <button className="btn-ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </main>
  );
}
