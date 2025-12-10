import { useState, useEffect, useCallback } from "react";
import BN from "bn.js";

export interface CountdownValue {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  isExpired: boolean;
}

export function useCountdown(endTimestamp: BN | number): CountdownValue {
  const getTimeRemaining = useCallback((): CountdownValue => {
    const end = typeof endTimestamp === "number"
      ? endTimestamp
      : endTimestamp.toNumber();
    const now = Math.floor(Date.now() / 1000);
    const total = Math.max(0, end - now);

    return {
      days: Math.floor(total / (60 * 60 * 24)),
      hours: Math.floor((total % (60 * 60 * 24)) / (60 * 60)),
      minutes: Math.floor((total % (60 * 60)) / 60),
      seconds: total % 60,
      total,
      isExpired: total <= 0,
    };
  }, [endTimestamp]);

  const [timeRemaining, setTimeRemaining] = useState<CountdownValue>(getTimeRemaining);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = getTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining.isExpired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [getTimeRemaining]);

  return timeRemaining;
}
