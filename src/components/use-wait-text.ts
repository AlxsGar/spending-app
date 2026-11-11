import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// "Too many wrong PINs. Try again in 4:32." while the wrong-PIN delay runs, and
// null once it is over. Re-renders every second while it counts down.
export function useWaitText(waitUntil: number | null): string | null {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (waitUntil === null) return;
    // A first read right away, so a wait that just started is not measured from
    // an old "now".
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [waitUntil]);

  if (waitUntil === null || waitUntil <= now) return null;
  return t('lock.wait', { time: formatWait(waitUntil - now) });
}

// m:ss, rounded up so the last second still shows 0:01.
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
