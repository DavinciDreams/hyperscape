/**
 * StreamingOverlay - Main overlay container for streaming mode
 *
 * Displays:
 * - Duel info panel (top center)
 * - Agent HP bars (bottom)
 * - Leaderboard (left side)
 * - Countdown timer
 * - Victory announcement
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import type { StreamingState, AgentInfo } from "../../screens/StreamingMode";
import { AgentStatsDisplay } from "./AgentStatsDisplay";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { CountdownOverlay } from "./CountdownOverlay";
import { VictoryOverlay } from "./VictoryOverlay";
import { DamageFloaters } from "./DamageFloaters";

// Delay before showing victory overlay during RESOLUTION phase (ms).
// Short delay for dramatic effect - text appears as winner starts celebrating.
// Victory overlay is now transparent (no card) so characters are visible behind it.
const VICTORY_OVERLAY_DELAY_MS = 500;

/** How long the "FIGHT!" text lingers after the countdown ends (ms). */
const FIGHT_TEXT_LINGER_MS = 2500;

/** A single floating damage number to display and animate out. */
export interface DamageFloaterEntry {
  id: string;
  amount: number;
  side: "left" | "right";
  createdAt: number;
}

interface StreamingOverlayProps {
  state: StreamingState | null;
}

export function StreamingOverlay({ state }: StreamingOverlayProps) {
  const [showVictory, setShowVictory] = useState(false);
  const victoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track when the FIGHTING phase starts so the "FIGHT!" text can linger
  const [showFightText, setShowFightText] = useState(false);
  const fightTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Damage floater tracking ---
  const prevHpRef = useRef<{
    agent1Hp: number | null;
    agent2Hp: number | null;
  }>({
    agent1Hp: null,
    agent2Hp: null,
  });
  const [damageFloaters, setDamageFloaters] = useState<DamageFloaterEntry[]>(
    [],
  );

  const phase = state?.cycle?.phase;

  // Detect HP drops and spawn damage floaters
  const agent1 = state?.cycle?.agent1 ?? null;
  const agent2 = state?.cycle?.agent2 ?? null;
  const agent1Hp = agent1?.hp ?? null;
  const agent2Hp = agent2?.hp ?? null;

  useEffect(() => {
    const prev = prevHpRef.current;
    const newFloaters: DamageFloaterEntry[] = [];

    if (phase === "FIGHTING") {
      if (
        prev.agent1Hp !== null &&
        agent1Hp !== null &&
        agent1Hp < prev.agent1Hp
      ) {
        const dmg = prev.agent1Hp - agent1Hp;
        newFloaters.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-a1`,
          amount: dmg,
          side: "left" as const,
          createdAt: Date.now(),
        });
      }
      if (
        prev.agent2Hp !== null &&
        agent2Hp !== null &&
        agent2Hp < prev.agent2Hp
      ) {
        const dmg = prev.agent2Hp - agent2Hp;
        newFloaters.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-a2`,
          amount: dmg,
          side: "right" as const,
          createdAt: Date.now(),
        });
      }
    }

    prev.agent1Hp = agent1Hp;
    prev.agent2Hp = agent2Hp;

    if (newFloaters.length > 0) {
      setDamageFloaters((existing) => [...existing, ...newFloaters]);
    }
  }, [agent1Hp, agent2Hp, phase]);

  // Reset floaters and prev HP when fight cycle changes
  const cycleId = state?.cycle?.cycleId;
  useEffect(() => {
    setDamageFloaters([]);
    prevHpRef.current = { agent1Hp: null, agent2Hp: null };
  }, [cycleId]);

  const handleFloaterExpire = useCallback((id: string) => {
    setDamageFloaters((existing) => existing.filter((f) => f.id !== id));
  }, []);

  useEffect(() => {
    if (phase === "RESOLUTION") {
      victoryTimerRef.current = setTimeout(() => {
        setShowVictory(true);
      }, VICTORY_OVERLAY_DELAY_MS);
    } else {
      setShowVictory(false);
      if (victoryTimerRef.current) {
        clearTimeout(victoryTimerRef.current);
        victoryTimerRef.current = null;
      }
    }
    return () => {
      if (victoryTimerRef.current) {
        clearTimeout(victoryTimerRef.current);
        victoryTimerRef.current = null;
      }
    };
  }, [phase]);

  // When transitioning to FIGHTING, keep the fight text visible for a linger period
  useEffect(() => {
    if (phase === "FIGHTING") {
      setShowFightText(true);
      fightTextTimerRef.current = setTimeout(() => {
        setShowFightText(false);
      }, FIGHT_TEXT_LINGER_MS);
    } else if (phase !== "COUNTDOWN") {
      setShowFightText(false);
      if (fightTextTimerRef.current) {
        clearTimeout(fightTextTimerRef.current);
        fightTextTimerRef.current = null;
      }
    }
    return () => {
      if (fightTextTimerRef.current) {
        clearTimeout(fightTextTimerRef.current);
        fightTextTimerRef.current = null;
      }
    };
  }, [phase]);

  if (!state) {
    return (
      <div style={styles.waitingContainer}>
        <div style={styles.waitingText}>Waiting for duel data...</div>
      </div>
    );
  }

  const { cycle, leaderboard } = state;
  const { countdown, winnerId, winnerName, winReason, timeRemaining } = cycle;

  // Get winner agent info
  const winnerAgent =
    winnerId === agent1?.id ? agent1 : winnerId === agent2?.id ? agent2 : null;

  return (
    <div style={styles.overlay}>
      {/* Duel Info - Top Center */}
      {(phase === "FIGHTING" || phase === "COUNTDOWN") && agent1 && agent2 && (
        <div style={styles.duelInfoContainer}>
          <AgentStatsDisplay agent={agent1} side="left" />
          <div style={styles.timerContainer}>
            <div style={styles.timerHexOuter}>
              <div style={styles.timerHexInner}>
                <div style={styles.timerHighlight} />
                {formatTime(timeRemaining)}
              </div>
              <div style={styles.timerInsetShadow} />
            </div>
          </div>
          <AgentStatsDisplay agent={agent2} side="right" />
        </div>
      )}

      {/* Damage floaters — rendered over the HP bar area */}
      {damageFloaters.length > 0 && (
        <DamageFloaters
          floaters={damageFloaters}
          onExpire={handleFloaterExpire}
        />
      )}

      {/* Next duel countdown - shown when no active fight */}
      {(phase === "IDLE" ||
        phase === "ANNOUNCEMENT" ||
        phase === "RESOLUTION") && (
        <div style={styles.nextDuelTimerContainer}>
          <div style={styles.nextDuelLabel}>NEXT DUEL</div>
          <div style={styles.nextDuelTimer}>
            {timeRemaining > 0 ? formatTime(timeRemaining) : "--:--"}
          </div>
        </div>
      )}

      {/* Countdown Overlay — stays mounted during early FIGHTING for "FIGHT!" linger */}
      {((phase === "COUNTDOWN" && cycle.fightStartTime != null) ||
        (phase === "FIGHTING" &&
          showFightText &&
          cycle.fightStartTime != null)) && (
        <CountdownOverlay fightStartTime={cycle.fightStartTime} />
      )}

      {/* Victory Overlay — delayed so death animation plays first */}
      {phase === "RESOLUTION" && showVictory && winnerAgent && (
        <VictoryOverlay
          winner={winnerAgent}
          loser={
            winnerId === agent1?.id
              ? agent2
              : winnerId === agent2?.id
                ? agent1
                : null
          }
          winReason={winReason || "victory"}
        />
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    zIndex: 50,
  },
  waitingContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 50,
  },
  waitingText: {
    color: "#f2d08a",
    fontSize: "1.5rem",
    textShadow: "0 2px 4px rgba(0,0,0,0.8)",
  },
  leaderboardContainer: {
    position: "absolute",
    top: "80px",
    left: "20px",
    pointerEvents: "auto",
  },
  duelInfoContainer: {
    position: "absolute",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    width: "min(1200px, calc(100vw - 40px))",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  timerContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: 42,
  },
  timerHexOuter: {
    minWidth: 164,
    height: 52,
    position: "relative",
    padding: 1,
    clipPath: "polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.1) 100%)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.45), 0 0 14px rgba(96,165,250,0.14)",
  },
  timerHexInner: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(232,243,255,0.95)",
    fontSize: "clamp(1.28rem, 2.7vw, 2rem)",
    fontWeight: 900,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: 1.2,
    textShadow: "0 0 12px rgba(96,165,250,0.25)",
    background:
      "linear-gradient(180deg, rgba(10,12,18,0.9) 0%, rgba(10,12,18,0.76) 100%)",
    clipPath: "polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)",
    backdropFilter: "blur(14px) saturate(1.2)",
    WebkitBackdropFilter: "blur(14px) saturate(1.2)",
    position: "relative",
    overflow: "hidden",
  },
  timerHighlight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(191,219,254,0.45), transparent)",
  },
  timerInsetShadow: {
    position: "absolute",
    inset: 0,
    clipPath: "polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
    pointerEvents: "none",
  },
  nextDuelTimerContainer: {
    position: "absolute",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "rgba(0, 0, 0, 0.6)",
    padding: "12px 28px",
    borderRadius: "8px",
    border: "2px solid rgba(242, 208, 138, 0.5)",
  },
  nextDuelLabel: {
    color: "#f2d08a",
    fontSize: "0.75rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "2px",
    marginBottom: "4px",
  },
  nextDuelTimer: {
    color: "#fff",
    fontSize: "2rem",
    fontWeight: "bold",
    fontFamily: "monospace",
    textShadow: "0 2px 4px rgba(0,0,0,0.8)",
  },
};
