import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

export function HackAnimation() {
  const actionLog = useGameStore(state => state.actionLog);
  const [activeHack, setActiveHack] = useState<Record<string, any> | null>(null);
  const [phase, setPhase] = useState<'terminal' | 'result'>('terminal');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    if (actionLog.length === 0) return;
    const latest = actionLog[actionLog.length - 1];

    if (
      latest.actionType === 'hack' &&
      latest.metadata &&
      (latest.metadata as any).type === 'hack' &&
      Date.now() - latest.timestamp < 2000
    ) {
      clearTimers();
      setActiveHack(latest.metadata as Record<string, any>);
      setPhase('terminal');

      const t1 = setTimeout(() => setPhase('result'), 3000);
      const t2 = setTimeout(() => setActiveHack(null), 10000); // linger longer
      timersRef.current = [t1, t2];
    }

    return () => clearTimers();
  }, [actionLog.length]);

  if (!activeHack) return null;

  const { success, sourceName, targetName, amount, penalty } = activeHack;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-black border border-green-900 rounded-lg shadow-[0_0_50px_rgba(0,255,0,0.1)] p-8 font-mono overflow-hidden relative">

        {/* CRT Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-10 opacity-20" />

        <div className="relative z-20">
          <div className="mb-4 text-green-500 text-sm">
            <span className="font-bold">SYSTEM OVERRIDE INITIATED</span>
            <span className="animate-pulse">_</span>
          </div>

          <div className="space-y-2 text-green-400 text-lg sm:text-2xl mb-8">
            {/* Source is hidden during terminal phase & on success — only revealed on failure */}
            <p>{`> SOURCE PORT: ██████████`}</p>
            <p>{`> TARGET HOST: ${String(targetName ?? '???').toUpperCase()}`}</p>
            <p>{`> EXECUTING PAYLOAD...`}</p>
          </div>

          {phase === 'terminal' && (
            <div className="flex justify-center my-12">
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-4 h-8 bg-green-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === 'result' && (
            <div className={`mt-8 p-6 text-center border-2 rounded transition-all duration-500 ${
              success
                ? 'border-green-500 bg-green-950/40 shadow-[0_0_40px_rgba(34,197,94,0.4)]'
                : 'border-red-600 bg-red-950/40 shadow-[0_0_40px_rgba(220,38,38,0.5)]'
            }`}>
              <h2 className={`text-5xl font-black mb-4 ${success ? 'text-green-400' : 'text-red-500'}`}>
                {success ? 'BREACH SUCCESSFUL' : 'ACCESS DENIED'}
              </h2>
              <p className={`text-2xl ${success ? 'text-green-300' : 'text-red-400'}`}>
                {success
                  ? `[!] $${amount ?? 0} transferred from ${targetName}'s accounts.`
                  : `[-] Firewall held. Attacker traced: ${sourceName} lost $${penalty ?? 0} and 1 AP.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
