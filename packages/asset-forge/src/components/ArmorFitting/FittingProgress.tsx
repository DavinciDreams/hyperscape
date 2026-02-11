import React, { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "../common";

interface FittingProgressProps {
  progress: number;
  message: string;
  startTime?: number | null;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export const FittingProgress: React.FC<FittingProgressProps> = ({
  progress,
  message,
  startTime,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [stalled, setStalled] = useState(false);
  const lastProgressRef = useRef(progress);
  const lastChangeTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    setElapsed(Date.now() - startTime);
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 250);

    return () => clearInterval(interval);
  }, [startTime]);

  // Detect stalled progress
  useEffect(() => {
    if (progress !== lastProgressRef.current) {
      lastProgressRef.current = progress;
      lastChangeTimeRef.current = Date.now();
      setStalled(false);
    }

    const timer = setInterval(() => {
      if (Date.now() - lastChangeTimeRef.current > 2000 && progress < 100) {
        setStalled(true);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [progress]);

  const roundedProgress = Math.round(progress);

  // Estimate remaining time based on elapsed and progress
  const estimatedRemaining =
    progress > 5 && elapsed > 500
      ? Math.round((elapsed / progress) * (100 - progress))
      : null;

  return (
    <div className="absolute bottom-4 left-4 right-4">
      <Card className="bg-bg-tertiary/90 backdrop-blur-md border border-white/10 shadow-lg">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary/30 border-t-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-text-primary truncate">
                  {message}
                  {stalled && (
                    <span className="ml-2 text-text-tertiary animate-pulse">
                      Still working...
                    </span>
                  )}
                </p>
                <span className="text-sm font-mono text-primary font-semibold ml-2 flex-shrink-0">
                  {roundedProgress}%
                </span>
              </div>
              <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-text-tertiary font-mono">
                  {formatElapsed(elapsed)} elapsed
                </span>
                {estimatedRemaining !== null && progress < 100 && (
                  <span className="text-[11px] text-text-tertiary font-mono">
                    ~{formatElapsed(estimatedRemaining)} remaining
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FittingProgress;
