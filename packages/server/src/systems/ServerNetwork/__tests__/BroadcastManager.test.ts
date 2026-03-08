import { beforeEach, describe, expect, it, vi } from "vitest";
import { BroadcastManager } from "../broadcast";
import { PacketPriority } from "../BandwidthBudget";
import type { ServerSocket } from "../../../shared/types";

type MockServerSocket = ServerSocket & {
  send: ReturnType<typeof vi.fn>;
  sendPacket: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const createSocket = (
  id: string,
  overrides: Partial<MockServerSocket> = {},
): MockServerSocket =>
  ({
    id,
    send: vi.fn(),
    sendPacket: vi.fn(),
    disconnect: vi.fn(),
    ws: {} as ServerSocket["ws"],
    network: {} as ServerSocket["network"],
    ...overrides,
  }) as MockServerSocket;

describe("BroadcastManager", () => {
  let sockets: Map<string, ServerSocket>;
  let manager: BroadcastManager;

  beforeEach(() => {
    sockets = new Map();
    manager = new BroadcastManager(sockets);
  });

  it("uses the bandwidth budget for nearby broadcasts", () => {
    const socket = createSocket("socket-1", {
      characterId: "player-1",
    });
    sockets.set(socket.id, socket);
    manager.setSpatialIndex({
      getPlayersNear: vi.fn(() => ["player-1"]),
    } as never);

    const canSendSpy = vi
      .spyOn(manager.bandwidthBudget, "canSend")
      .mockReturnValue(false);
    const recordSendSpy = vi.spyOn(manager.bandwidthBudget, "recordSend");

    const sentCount = manager.sendToNearby(
      "entityModified",
      { id: "mob-1" },
      10,
      20,
      undefined,
      PacketPriority.HIGH,
    );

    expect(sentCount).toBe(0);
    expect(canSendSpy).toHaveBeenCalledWith(
      "socket-1",
      expect.any(Number),
      PacketPriority.HIGH,
    );
    expect(socket.sendPacket).not.toHaveBeenCalled();
    expect(recordSendSpy).not.toHaveBeenCalled();
  });

  it("records bandwidth usage for successful broadcasts", () => {
    const socketA = createSocket("socket-a");
    const socketB = createSocket("socket-b");
    sockets.set(socketA.id, socketA);
    sockets.set(socketB.id, socketB);

    const canSendSpy = vi
      .spyOn(manager.bandwidthBudget, "canSend")
      .mockReturnValue(true);
    const recordSendSpy = vi.spyOn(manager.bandwidthBudget, "recordSend");

    const sentCount = manager.sendToAll(
      "entityModified",
      { id: "mob-1" },
      undefined,
      PacketPriority.NORMAL,
    );

    expect(sentCount).toBe(2);
    expect(canSendSpy).toHaveBeenCalledTimes(2);
    expect(recordSendSpy).toHaveBeenCalledTimes(2);
    expect(socketA.sendPacket).toHaveBeenCalledTimes(1);
    expect(socketB.sendPacket).toHaveBeenCalledTimes(1);
  });

  it("resolves players by characterId before async player attachment finishes", () => {
    const socket = createSocket("socket-1", {
      characterId: "player-1",
    });
    sockets.set(socket.id, socket);

    const didSend = manager.sendToPlayer("player-1", "inventoryUpdated", {
      playerId: "player-1",
    });

    expect(didSend).toBe(true);
    expect(socket.send).toHaveBeenCalledWith("inventoryUpdated", {
      playerId: "player-1",
    });
    expect(manager.getPlayerSocket("player-1")).toBe(socket);
  });
});
