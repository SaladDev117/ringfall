import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Difference between the server's clock and this phone's. Timers use server time, never the phone's. */
let offset = 0;

export function syncServerTime(serverTime: number): void {
  offset = serverTime - Date.now();
}

export const serverNow = (): number => Date.now() + offset;

/** Server time minus this device's time, for code that keeps its own clock (the 3D views). */
export const clockOffset = (): number => offset;

const ClockContext = createContext(0);

/** One shared one-second tick for every countdown on screen. */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

export const useNow = (): number => useContext(ClockContext);
