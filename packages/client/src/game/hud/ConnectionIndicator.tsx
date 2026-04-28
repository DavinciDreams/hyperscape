/**
 * Connection Indicator — host adapter.
 *
 * Renders the registered `ConnectionIndicator` widget from the
 * `@hyperforge/hyperscape` meta-plugin (slice 34 of the D6.c
 * widget migration arc). This file is now a thin adapter:
 *   - subscribes to the engine's NETWORK_* events
 *   - projects the reconnect state machine into the widget's
 *     typed props (`status`, `attempt`, `maxAttempts`)
 *   - exposes the same `<ConnectionIndicator world={...} />`
 *     surface so the call site in CoreUI.tsx stays unchanged
 *
 * Layout, animation, and visual states all live in the registered
 * widget at
 * `packages/hyperscape-plugin/src/widgets/ConnectionIndicatorWidget.tsx`.
 */

import React, { useCallback, useEffect, useState } from "react";
import { EventType } from "@hyperforge/shared";
import {
  ConnectionIndicator as ConnectionIndicatorWidget,
  type ConnectionStatus,
} from "@hyperforge/hyperscape";
import type { ClientWorld } from "../../types";

interface ReconnectState {
  status: ConnectionStatus;
  attempt: number;
  maxAttempts: number;
}

interface ConnectionIndicatorProps {
  world: ClientWorld | null;
}

export function ConnectionIndicator({
  world,
}: ConnectionIndicatorProps): React.ReactElement | null {
  const [state, setState] = useState<ReconnectState>({
    status: "connected",
    attempt: 0,
    maxAttempts: 10,
  });

  const handleReconnecting = useCallback((payload: unknown) => {
    const data = payload as { attempt: number; maxAttempts: number };
    setState({
      status: "reconnecting",
      attempt: data.attempt,
      maxAttempts: data.maxAttempts,
    });
  }, []);

  const handleReconnected = useCallback(() => {
    setState({ status: "connected", attempt: 0, maxAttempts: 10 });
  }, []);

  const handleDisconnected = useCallback(() => {
    setState((prev) => {
      if (prev.status === "reconnecting") return prev;
      return { ...prev, status: "disconnected" };
    });
  }, []);

  const handleReconnectFailed = useCallback((payload: unknown) => {
    const data = payload as { attempts: number };
    setState({
      status: "failed",
      attempt: data.attempts,
      maxAttempts: data.attempts,
    });
  }, []);

  useEffect(() => {
    if (!world) return;
    world.on(EventType.NETWORK_RECONNECTING, handleReconnecting);
    world.on(EventType.NETWORK_RECONNECTED, handleReconnected);
    world.on(EventType.NETWORK_DISCONNECTED, handleDisconnected);
    world.on(EventType.NETWORK_RECONNECT_FAILED, handleReconnectFailed);
    return () => {
      world.off(EventType.NETWORK_RECONNECTING, handleReconnecting);
      world.off(EventType.NETWORK_RECONNECTED, handleReconnected);
      world.off(EventType.NETWORK_DISCONNECTED, handleDisconnected);
      world.off(EventType.NETWORK_RECONNECT_FAILED, handleReconnectFailed);
    };
  }, [
    world,
    handleReconnecting,
    handleReconnected,
    handleDisconnected,
    handleReconnectFailed,
  ]);

  if (state.status === "connected") return null;

  return (
    <ConnectionIndicatorWidget
      status={state.status}
      attempt={state.attempt}
      maxAttempts={state.maxAttempts}
      topOffsetPx={56}
      zIndex={50}
      panelBackgroundColor="rgba(40, 40, 40, 0.95)"
      failedBackgroundColor="rgba(180, 30, 30, 0.95)"
      borderColor="#555"
      failedBorderColor="#c44"
      textColor="#ffffff"
      secondaryTextColor="#aaaaaa"
      failedTextColor="#ffaaaa"
      spinnerColor="#888888"
      progressColor="#4a9eff"
      progressTrackColor="#333333"
    />
  );
}

export default ConnectionIndicator;
