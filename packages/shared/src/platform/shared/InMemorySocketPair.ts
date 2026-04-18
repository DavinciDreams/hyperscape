/**
 * In-memory duplex socket pair.
 *
 * Produces two `NodeWebSocket`-compatible endpoints that pipe each
 * other's writes into the peer's `message` event. Used by PIE to run
 * a real client+server pair in-process without opening a TCP socket.
 *
 * Each endpoint implements the same surface the `Socket` class already
 * assumes:
 *
 *   - `on(event, listener)` / `removeListener(event, listener)` for
 *     `"message" | "pong" | "close"` events.
 *   - `send(packet)` writes a binary packet to the peer.
 *   - `ping()` delivers a `"pong"` event on the peer (there is no
 *     protocol-level ping in the in-memory transport, so we short-circuit
 *     the heartbeat).
 *   - `close()` / `terminate()` deliver `"close"` to both sides.
 *
 * Delivery is async (`queueMicrotask` by default) to match the event-loop
 * timing of a real WebSocket. A `latencyMs` knob forces an `setTimeout`
 * delay on each packet, useful for desync + interpolation regression tests.
 *
 * @internal
 */

type SocketEvent = "message" | "pong" | "close";

interface PairedSocketOptions {
  /** Per-packet latency in ms. 0 = microtask-deferred (matches native). */
  latencyMs?: number;
  /** Tag used in diagnostics / error messages. */
  tag?: string;
}

/**
 * One end of an in-memory pair. Implements enough of the `NodeWebSocket`
 * surface that `Socket` in `platform/shared/Socket.ts` is oblivious to
 * the fact it isn't talking to a real `ws`.
 */
export class InMemorySocket {
  /** Peer endpoint — set by `InMemorySocketPair.create`. */
  private _peer: InMemorySocket | null = null;
  private readonly _listeners: Record<SocketEvent, Set<Function>> = {
    message: new Set(),
    pong: new Set(),
    close: new Set(),
  };
  private _closed = false;
  private readonly _latencyMs: number;
  readonly tag: string;

  constructor(opts: PairedSocketOptions = {}) {
    this._latencyMs = Math.max(0, opts.latencyMs ?? 0);
    this.tag = opts.tag ?? "in-memory";
  }

  /** @internal */
  _bindPeer(peer: InMemorySocket): void {
    this._peer = peer;
  }

  on(event: string, listener: Function): void {
    const key = event as SocketEvent;
    const set = this._listeners[key];
    if (!set) return;
    set.add(listener);
  }

  removeListener(event: string, listener: Function): void {
    const key = event as SocketEvent;
    this._listeners[key]?.delete(listener);
  }

  /**
   * Send a packet to the peer. The packet is delivered through the peer's
   * `message` listeners on the next microtask (or after `latencyMs`).
   */
  send(packet: ArrayBuffer | Uint8Array): void {
    if (this._closed) return;
    const peer = this._peer;
    if (!peer || peer._closed) return;
    this._schedule(() => peer._dispatch("message", packet));
  }

  /**
   * The real WebSocket's `ping()` writes a control frame the runtime
   * automatically answers with a `pong`. In-memory we fire `pong` on the
   * peer directly so the heartbeat code paths run end-to-end.
   */
  ping(): void {
    if (this._closed) return;
    const peer = this._peer;
    if (!peer || peer._closed) return;
    this._schedule(() => peer._dispatch("pong", undefined));
  }

  close(): void {
    this._closeBoth(1000);
  }

  terminate(): void {
    this._closeBoth(1006);
  }

  /** @internal test hook — dispatches the same event the peer would. */
  _dispatch(event: SocketEvent, arg: unknown): void {
    const set = this._listeners[event];
    if (!set || set.size === 0) return;
    // Copy so handlers that mutate the set don't miss each other.
    for (const fn of Array.from(set)) {
      (fn as (arg?: unknown) => void)(arg);
    }
  }

  private _closeBoth(code: number): void {
    if (this._closed) return;
    this._closed = true;
    // Deliver close on both sides (ours first, matches real WS semantics
    // where the closing side sees the event when its socket transitions).
    this._schedule(() => this._dispatch("close", { code }));
    const peer = this._peer;
    if (peer && !peer._closed) {
      peer._closed = true;
      peer._schedule(() => peer._dispatch("close", { code }));
    }
  }

  private _schedule(fn: () => void): void {
    if (this._latencyMs > 0) {
      setTimeout(fn, this._latencyMs);
    } else {
      queueMicrotask(fn);
    }
  }
}

/**
 * DOM-style `WebSocket`-compatible adapter over an `InMemorySocket`.
 *
 * The server side consumes `InMemorySocket` directly via its Node-style
 * `on(event, listener)` API (wrapped by the real `Socket` class). The
 * client side needs the browser/DOM `WebSocket` surface that
 * `ClientNetwork.attachPreconnectedSocket` expects:
 *
 *   - `addEventListener("message" | "close" | "open" | "error", listener)`
 *   - `removeEventListener(...)`
 *   - `readyState` matching `WebSocket.OPEN/CLOSING/CLOSED`
 *   - `binaryType` (settable; always binary here)
 *   - `send(data)` writing to the peer
 *   - `close()` closing both ends
 *
 * Dispatched `message` events carry `{ data: ArrayBuffer | Uint8Array }`
 * matching `MessageEvent`; `close` events carry `{ code }` matching
 * `CloseEvent`. These shapes are the contract
 * `ClientNetwork.onPacket/onClose` rely on.
 */
type DomMessageListener = (event: { data: ArrayBuffer | Uint8Array }) => void;
type DomCloseListener = (event: { code: number }) => void;
type DomPlainListener = (event: unknown) => void;

export class InMemoryClientSocket {
  binaryType: "arraybuffer" | "blob" = "arraybuffer";
  /** 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED — matches DOM `WebSocket`. */
  readyState: number = 1;

  private readonly _message = new Set<DomMessageListener>();
  private readonly _close = new Set<DomCloseListener>();
  private readonly _open = new Set<DomPlainListener>();
  private readonly _error = new Set<DomPlainListener>();

  constructor(private readonly _inner: InMemorySocket) {
    _inner.on("message", (packet: unknown) => {
      const data = packet as ArrayBuffer | Uint8Array;
      for (const fn of Array.from(this._message)) fn({ data });
    });
    _inner.on("close", (arg: unknown) => {
      const evt = (arg as { code?: number } | undefined) ?? { code: 1000 };
      this.readyState = 3;
      for (const fn of Array.from(this._close)) fn({ code: evt.code ?? 1000 });
    });
  }

  addEventListener(type: string, listener: Function): void {
    switch (type) {
      case "message":
        this._message.add(listener as DomMessageListener);
        break;
      case "close":
        this._close.add(listener as DomCloseListener);
        break;
      case "open":
        this._open.add(listener as DomPlainListener);
        break;
      case "error":
        this._error.add(listener as DomPlainListener);
        break;
    }
  }

  removeEventListener(type: string, listener: Function): void {
    switch (type) {
      case "message":
        this._message.delete(listener as DomMessageListener);
        break;
      case "close":
        this._close.delete(listener as DomCloseListener);
        break;
      case "open":
        this._open.delete(listener as DomPlainListener);
        break;
      case "error":
        this._error.delete(listener as DomPlainListener);
        break;
    }
  }

  send(data: ArrayBuffer | Uint8Array): void {
    this._inner.send(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 2;
    this._inner.close();
  }

  /** Escape hatch for diagnostics / tests. */
  get innerSocket(): InMemorySocket {
    return this._inner;
  }
}

/**
 * Factory — creates a bound pair. Callers hand one end to the server's
 * `ServerNetwork.onConnection` path and the other to the client's
 * `ClientNetwork.init` path.
 */
export interface SocketPair {
  server: InMemorySocket;
  client: InMemorySocket;
}

export interface SocketPairOptions {
  /** Per-packet latency (both directions). */
  latencyMs?: number;
}

export function createInMemorySocketPair(
  opts: SocketPairOptions = {},
): SocketPair {
  const server = new InMemorySocket({
    latencyMs: opts.latencyMs,
    tag: "pie-server",
  });
  const client = new InMemorySocket({
    latencyMs: opts.latencyMs,
    tag: "pie-client",
  });
  server._bindPeer(client);
  client._bindPeer(server);
  return { server, client };
}

/**
 * Wrap an `InMemorySocket` in the DOM `WebSocket`-compatible adapter.
 *
 * Convenience for PIE callers: `ClientNetwork.attachPreconnectedSocket`
 * wants a `WebSocket`-shaped object. Typical usage:
 *
 * ```ts
 * const { server, client } = createInMemorySocketPair();
 * await session.connect({ characterId: "editor-host" }); // hands `server` to ServerNetwork
 * clientNetwork.attachPreconnectedSocket(
 *   asClientWebSocket(client) as unknown as WebSocket,
 * );
 * ```
 */
export function asClientWebSocket(
  socket: InMemorySocket,
): InMemoryClientSocket {
  return new InMemoryClientSocket(socket);
}
