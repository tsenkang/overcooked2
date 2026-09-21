import type { ReactNode } from 'react';

function Key({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Stars({ n, size = 'text-3xl', lit = n }: { n: number; size?: string; lit?: number }) {
  return (
    <div className={`flex gap-1 ${size}`} aria-label={`${n} de 3 estrelas`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`transition-all duration-300 ${i < Math.min(n, lit) ? 'text-[#ffc72c] scale-100 drop-shadow-[0_2px_0_#b7791f]' : 'text-black/15 scale-90'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const ACTIONS = [
  { label: 'Andar', p1: ['W', 'A', 'S', 'D'], p2: ['↑', '←', '↓', '→'], pad: 'Analógico' },
  { label: 'Pegar / soltar', p1: ['Espaço'], p2: ['Enter'], pad: 'A' },
  { label: 'Cortar · lavar · jogar · extintor', p1: ['E'], p2: ['Shift dir.'], pad: 'X' },
  { label: 'Correr (dash)', p1: ['Shift esq.'], p2: ['Ctrl dir.'], pad: 'B' },
];

export function Controls({ solo, compact = false }: { solo: boolean; compact?: boolean }) {
  return (
    <div className={`rounded-2xl bg-[#2b1d16]/5 ${compact ? 'p-3' : 'p-4'}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[#6b5446]">
            <th className="font-bold pb-2">Ação</th>
            <th className="font-bold pb-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2f7de1] mr-1.5" />
              Chef 1
            </th>
            {!solo && (
              <th className="font-bold pb-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef5a3c] mr-1.5" />
                Chef 2
              </th>
            )}
            {!compact && <th className="font-bold pb-2">Controle</th>}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a.label} className="border-t border-[#2b1d16]/10">
              <td className="py-1.5 pr-2">{a.label}</td>
              <td className="py-1.5 space-x-1">{a.p1.map((k) => <Key key={k}>{k}</Key>)}</td>
              {!solo && <td className="py-1.5 space-x-1">{a.p2.map((k) => <Key key={k}>{k}</Key>)}</td>}
              {!compact && (
                <td className="py-1.5">
                  <Key>{a.pad}</Key>
                </td>
              )}
            </tr>
          ))}
          {solo && (
            <tr className="border-t border-[#2b1d16]/10">
              <td className="py-1.5 pr-2">Trocar de chef</td>
              <td className="py-1.5 space-x-1">
                <Key>Q</Key> <Key>Tab</Key>
              </td>
              {!compact && (
                <td className="py-1.5">
                  <Key>LB / RB</Key>
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
      {!solo && !compact && (
        <p className="mt-2 text-xs text-[#6b5446]">Chef 2 também pode usar K (pegar), L (usar) e ; (dash). Até 2 controles.</p>
      )}
    </div>
  );
}
