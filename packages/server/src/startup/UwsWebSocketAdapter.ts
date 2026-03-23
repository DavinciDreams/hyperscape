/**
 * uWebSockets.js WebSocket Adapter
 *
 * Wraps a uWS.WebSocket to implement the NodeWebSocket interface used by
 * Socket class and connection-handler. This adapter pattern lets the game
 * logic remain transport-agnostic — it sees the same on/removeListener/send/
 * ping/terminate API whether the underlying transport is `ws` or uWS.
 *
 * Key design constraints:
 * - uWS has no EventEmitter; adapter emulates on/removeListener with a Map
 * - uWS invalidates ArrayBuffer after message callback; must copy before dispatch
 * - Must support multiple add/remove cycles for the same event name
 *   (connection-handler removes temp auth listener, then Socket adds permanent one)
 */

import type * as uWS from "uWebSockets.js";

/** Per-connection data stored on the uWS WebSocket via upgrade */
export interface UwsUserData {
  wsId: string;
  remoteAddress: string;
  query: Record<string, string>;
  adapter: UwsWebSocketAdapter | null;
}

type ListenerFn = (...args: unknown[]) => void;

/**
 * Adapter that makes a uWS.WebSocket behave like a Node.js `ws` WebSocket.
 *
 * Implements the NodeWebSocket interface (on, removeListener, removeAllListeners,
 * send, ping, terminate, close, __wsId, __remoteAddress) so that Socket,
 * ConnectionHandler, and SocketManager work without modification.
 */
export class UwsWebSocketAdapter {
  /** Event listeners keyed by event name */
  private listeners: Map<string, ListenerFn[]> = new Map();

  /** Whether the underlying uWS socket has been closed */
  private _closed = false;

  /** Unique identifier for this WebSocket */
  __wsId: string;

  /** Remote IP address */
  __remoteAddress: string;

  /** Buffered amount (always 0 for compatibility — uWS manages its own backpressure) */
  readonly bufferedAmount = 0;

  constructor(private uwsWs: uWS.WebSocket<UwsUserData>) {
    const userData = uwsWs.getUserData();
    this.__wsId = userData.wsId;
    this.__remoteAddress = userData.remoteAddress;
  }

  // ---------------------------------------------------------------------------
  // EventEmitter-like interface
  // ---------------------------------------------------------------------------

  on(event: string, listener: ListenerFn): void {
    let arr = this.listeners.get(event);
    if (!arr) {
      arr = [];
      this.listeners.set(event, arr);
    }
    arr.push(listener);
  }

  removeListener(event: string, listener: ListenerFn): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx !== -1) {
      arr.splice(idx, 1);
    }
    if (arr.length === 0) {
      this.listeners.delete(event);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  // ---------------------------------------------------------------------------
  // WebSocket-like interface
  // ---------------------------------------------------------------------------

  send(data: ArrayBuffer | Uint8Array | string): void {
    if (this._closed) return;
    try {
      // isBinary = true for ArrayBuffer/Uint8Array, false for string
      const isBinary = typeof data !== "string";
      this.uwsWs.send(data, isBinary);
    } catch {
      // Socket may have closed between check and send
    }
  }

  ping(): void {
    if (this._closed) return;
    try {
      this.uwsWs.ping();
    } catch {
      // Socket may have closed
    }
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this.uwsWs.close();
    } catch {
      // Already closed
    }
  }

  terminate(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this.uwsWs.end(1006, "");
    } catch {
      // Already closed
    }
  }

  // ---------------------------------------------------------------------------
  // Pub/Sub methods — for native uWS topic-based broadcasting
  // ---------------------------------------------------------------------------

  /** Subscribe this socket to a pub/sub topic */
  subscribe(topic: string): void {
    if (this._closed) return;
    try {
      this.uwsWs.subscribe(topic);
    } catch {
      // Socket may have closed
    }
  }

  /** Unsubscribe this socket from a pub/sub topic */
  unsubscribe(topic: string): void {
    if (this._closed) return;
    try {
      this.uwsWs.unsubscribe(topic);
    } catch {
      // Socket may have closed
    }
  }

  /**
   * Publish a message to a topic (fans out to all OTHER subscribers in C++).
   * The publishing socket itself does NOT receive the message.
   */
  publish(
    topic: string,
    message: ArrayBuffer | Uint8Array,
    isBinary: boolean,
  ): void {
    if (this._closed) return;
    try {
      this.uwsWs.publish(topic, message, isBinary);
    } catch {
      // Socket may have closed
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch methods — called from uws-server.ts callbacks
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a "message" event to registered listeners.
   * The caller MUST pass a copied buffer (message.slice(0)) because uWS
   * invalidates the original ArrayBuffer after the callback returns.
   */
  dispatchMessage(data: ArrayBuffer): void {
    const arr = this.listeners.get("message");
    if (!arr || arr.length === 0) return;
    // Iterate over a snapshot in case a listener modifies the array
    const snapshot = arr.slice();
    for (const fn of snapshot) {
      try {
        fn(data);
      } catch (err) {
        console.error("[UwsAdapter] Error in message listener:", err);
      }
    }
  }

  /** Dispatch a "pong" event to registered listeners. */
  dispatchPong(): void {
    const arr = this.listeners.get("pong");
    if (!arr || arr.length === 0) return;
    const snapshot = arr.slice();
    for (const fn of snapshot) {
      try {
        fn();
      } catch (err) {
        console.error("[UwsAdapter] Error in pong listener:", err);
      }
    }
  }

  /** Dispatch a "close" event to registered listeners. */
  dispatchClose(code: number): void {
    this._closed = true;
    const arr = this.listeners.get("close");
    if (!arr || arr.length === 0) return;
    const snapshot = arr.slice();
    for (const fn of snapshot) {
      try {
        fn({ code });
      } catch (err) {
        console.error("[UwsAdapter] Error in close listener:", err);
      }
    }
    // Release all listeners after close to help GC
    this.listeners.clear();
  }

  /** Dispatch an "error" event to registered listeners. */
  dispatchError(error: Error): void {
    const arr = this.listeners.get("error");
    if (!arr || arr.length === 0) return;
    const snapshot = arr.slice();
    for (const fn of snapshot) {
      try {
        fn(error);
      } catch (err) {
        console.error("[UwsAdapter] Error in error listener:", err);
      }
    }
  }
}
