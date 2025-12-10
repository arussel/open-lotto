"use client";

import { useState, useEffect } from "react";
import BN from "bn.js";

export function CountdownDisplay({ endTimestamp }: { endTimestamp: BN }) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  function getTimeLeft() {
    const now = Math.floor(Date.now() / 1000);
    const end = endTimestamp.toNumber();
    const total = Math.max(0, end - now);

    return {
      days: Math.floor(total / (60 * 60 * 24)),
      hours: Math.floor((total % (60 * 60 * 24)) / (60 * 60)),
      minutes: Math.floor((total % (60 * 60)) / 60),
      seconds: total % 60,
      total,
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [endTimestamp]);

  if (timeLeft.total <= 0) {
    return <span className="text-red-500 font-medium">Ended</span>;
  }

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (timeLeft.days > 0) {
    return (
      <span className="font-mono font-bold text-primary-600">
        {timeLeft.days}d {pad(timeLeft.hours)}h
      </span>
    );
  }

  return (
    <span className="font-mono font-bold text-primary-600">
      {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
    </span>
  );
}
