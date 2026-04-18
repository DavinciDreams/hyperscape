/**
 * Packet handler registration (Step 5d alternative wiring)
 *
 * Central server-side module that registers packet handlers on the
 * `IPacketHandlerRegistry` bridge system. See
 * `PLAN_SERVERNETWORK_MIGRATION.md` Step 5d alternative for context.
 *
 * As handlers are migrated out of `ServerNetwork/index.ts::registerHandlers()`
 * they should be moved here one at a time. The dispatcher in
 * `ServerNetwork.onMessage` already consults this registry before falling
 * back to the legacy `this.handlers[...]` dict, so per-handler migration is
 * risk-free: registry-registered handlers take precedence, unregistered
 * packets continue through the static dict unchanged.
 *
 * Once every entry in `registerHandlers()` is migrated here, the entire
 * method plus its ~25 handler imports can be deleted, allowing
 * `ServerNetwork/index.ts` to move into `@hyperforge/shared` (Step 6).
 */

import type { World } from "@hyperforge/shared";
import type { IPacketHandlerRegistry } from "../../../shared/src/systems/server/network/interfaces";
import type {
  BankOpenPayload,
  BankDepositPayload,
  BankWithdrawPayload,
  BankDepositAllPayload,
  CoinAmountPayload,
  BankMovePayload,
  BankCreateTabPayload,
  BankDeleteTabPayload,
  BankMoveToTabPayload,
  BankItemPayload,
  BankSlotPayload,
  BankWithdrawToEquipmentPayload,
  BankDepositEquipmentPayload,
  DialogueResponsePayload,
  DialogueNpcPayload,
  QuestIdPayload,
  CorpseLootAllPayload,
  NpcInteractPayload,
  EntityInteractPayload,
  StoreOpenPayload,
  StoreItemPayload,
  StoreClosePayload,
  TradeRequestPayload,
  TradeRespondPayload,
  TradeItemPayload,
  TradeSlotPayload,
  TradeSetQuantityPayload,
  TradeIdPayload,
  DuelChallengePayload,
  DuelChallengeRespondPayload,
  DuelToggleRulePayload,
  DuelToggleEquipmentPayload,
  DuelIdPayload,
  DuelAddStakePayload,
  DuelRemoveStakePayload,
  FriendTargetNamePayload,
  FriendRequestIdPayload,
  FriendIdPayload,
  IgnoreIdPayload,
  PrivateMessagePayload,
} from "../systems/ServerNetwork/types";
import { DeathState } from "@hyperforge/shared";
import {
  handleQuestAccept,
  handleQuestAbandon,
  handleQuestComplete,
} from "../../../shared/src/systems/server/network/handlers/quest";
import {
  handleStoreOpen,
  handleStoreBuy,
  handleStoreSell,
  handleStoreClose,
} from "../systems/ServerNetwork/handlers/store";
import { handleChangePlayerName } from "../../../shared/src/systems/server/network/handlers/player";
import {
  handleTradeRequest,
  handleTradeRequestRespond,
  handleTradeAddItem,
  handleTradeRemoveItem,
  handleTradeSetQuantity,
  handleTradeAccept,
  handleTradeCancelAccept,
  handleTradeCancel,
} from "../systems/ServerNetwork/handlers/trade";
import {
  handleDuelChallenge,
  handleDuelChallengeRespond,
  handleDuelToggleRule,
  handleDuelToggleEquipment,
  handleDuelAcceptRules,
  handleDuelCancel,
  handleDuelAddStake,
  handleDuelRemoveStake,
  handleDuelAcceptStakes,
  handleDuelAcceptFinal,
  handleDuelForfeit,
} from "../systems/ServerNetwork/handlers/duel";
import {
  handleFriendRequest,
  handleFriendAccept,
  handleFriendDecline,
  handleFriendRemove,
  handleIgnoreAdd,
  handleIgnoreRemove,
  handlePrivateMessage,
} from "../systems/ServerNetwork/handlers/friends";
import { getDatabase } from "../systems/ServerNetwork/handlers/common";
import { EventType } from "@hyperforge/shared";
import {
  handleBankOpen,
  handleBankDeposit,
  handleBankWithdraw,
  handleBankDepositAll,
  handleBankDepositCoins,
  handleBankWithdrawCoins,
  handleBankClose,
  handleBankMove,
  handleBankCreateTab,
  handleBankDeleteTab,
  handleBankMoveToTab,
  handleBankWithdrawPlaceholder,
  handleBankReleasePlaceholder,
  handleBankReleaseAllPlaceholders,
  handleBankToggleAlwaysPlaceholder,
  handleBankWithdrawToEquipment,
  handleBankDepositEquipment,
  handleBankDepositAllEquipment,
  handleRequestBankState,
} from "../systems/ServerNetwork/handlers/bank";
import {
  handleDialogueResponse,
  handleDialogueContinue,
  handleDialogueClose,
} from "../systems/ServerNetwork/handlers/dialogue";
import {
  handleGetQuestList,
  handleGetQuestDetail,
} from "../systems/ServerNetwork/handlers/quest";
import {
  handleChangeAttackStyle,
  handleSetAutoRetaliate,
} from "../systems/ServerNetwork/handlers/combat";
import {
  handlePickupItem,
  handleDropItem,
  handleEquipItem,
  handleUseItem,
  handleUnequipItem,
  handleMoveItem,
  handleCoinPouchWithdraw,
  handleXpLampUse,
} from "../systems/ServerNetwork/handlers/inventory";
import {
  handlePrayerToggle,
  handlePrayerDeactivateAll,
  handleAltarPray,
} from "../systems/ServerNetwork/handlers/prayer";
import { handleSetAutocast } from "../systems/ServerNetwork/handlers/magic";
import {
  handleActionBarSave,
  handleActionBarLoad,
} from "../systems/ServerNetwork/handlers/action-bar";
import {
  handleEntityEvent,
  handleEntityRemoved,
  handleEntityModified,
  handleSettings,
} from "../systems/ServerNetwork/handlers/entities";
import { handleChatAdded } from "../systems/ServerNetwork/handlers/chat";
import { handleResourceGather } from "../systems/ServerNetwork/handlers/resources";
import {
  handleHomeTeleport,
  handleHomeTeleportCancel,
} from "../systems/ServerNetwork/handlers/home-teleport";
import {
  handleCharacterListRequest,
  handleCharacterCreate,
  handleCharacterSelected,
} from "../../../shared/src/systems/server/network/character-selection";
import {
  handleResourceInteract,
  handleCookingSourceInteract,
  handleFiremakingRequest,
  handleCookingRequest,
  handleSmeltingSourceInteract,
  handleProcessingSmelting,
  handleSmithingSourceInteract,
  handleProcessingSmithing,
  handleCraftingSourceInteract,
  handleProcessingCrafting,
  handleFletchingSourceInteract,
  handleProcessingFletching,
  handleProcessingTanning,
  handleRunecraftingAltarInteract,
} from "../systems/ServerNetwork/handlers/processing";
import { handleCommand } from "../systems/ServerNetwork/handlers/commands";
import type { ServerNetwork } from "../../../shared/src/systems/server/network/index";

/**
 * Register all migrated packet handlers on the packet registry.
 *
 * Call once after world initialization, before connections are accepted.
 * The registry is a world system at `world.getSystem("packet-handlers")`.
 */
export function registerMigratedPacketHandlers(world: World): void {
  const registry = world.getSystem("packet-handlers") as
    | IPacketHandlerRegistry
    | undefined;

  if (!registry) {
    throw new Error(
      "[packetHandlerRegistration] packet-handlers system not registered — " +
        "expected startup/world.ts to register PacketHandlerBridgeSystem " +
        "before this module runs.",
    );
  }

  // onPing — echo game-level ping back as pong so clients can measure RTT.
  // Migrated from ServerNetwork/index.ts::registerHandlers().
  registry.register("onPing", (socket, data) => {
    socket.send("pong", data);
  });

  // Entity lifecycle — simple delegates that only need `world`.
  registry.register("onEntityEvent", (socket, data) =>
    handleEntityEvent(socket, data, world),
  );
  registry.register("onEntityRemoved", (socket, data) =>
    handleEntityRemoved(socket, data, world),
  );

  // Handlers that need ServerNetwork's BroadcastManager. ServerNetwork has
  // already initialized by the time this module runs (world.init() returned
  // before startup calls us), so the manager is guaranteed populated.
  const network = world.getSystem("network") as ServerNetwork | undefined;
  if (!network) {
    throw new Error(
      "[packetHandlerRegistration] ServerNetwork not registered — expected " +
        "startup/world.ts to register it before this module runs.",
    );
  }
  const broadcast = network.getBroadcastManager();
  const sendToAll = broadcast.sendToAll.bind(broadcast);

  registry.register("onChatAdded", (socket, data) =>
    handleChatAdded(socket, data, world, sendToAll),
  );
  registry.register("onEntityModified", (socket, data) =>
    handleEntityModified(socket, data, world, sendToAll),
  );
  registry.register("onSettingsModified", (socket, data) =>
    handleSettings(socket, data, world, sendToAll),
  );

  // Admin/debug commands — DB-coupled via `getDatabase(world)`. Kept
  // server-only (handler imports drizzle/pg schema); registered via
  // the bridge so ServerNetwork no longer imports `handleCommand`.
  const isBuilder = network.isBuilder.bind(network);
  registry.register("onCommand", (socket, data) =>
    handleCommand(
      socket,
      data,
      world,
      network.db,
      sendToAll,
      isBuilder,
      network.sockets,
    ),
  );

  // Resource gathering — plain world-only delegate.
  registry.register("onResourceGather", (socket, data) =>
    handleResourceGather(socket, data, world),
  );

  // Processing / skill handlers share a single context object built from
  // ServerNetwork-internal managers. Built once here and closed over.
  const processingCtx = network.getProcessingHandlerContext();
  registry.register("onResourceInteract", (socket, data) =>
    handleResourceInteract(socket, data, processingCtx),
  );
  registry.register("onCookingSourceInteract", (socket, data) =>
    handleCookingSourceInteract(socket, data, processingCtx),
  );
  registry.register("onFiremakingRequest", (socket, data) =>
    handleFiremakingRequest(socket, data, processingCtx),
  );
  registry.register("firemakingRequest", (socket, data) =>
    handleFiremakingRequest(socket, data, processingCtx),
  );
  registry.register("onCookingRequest", (socket, data) =>
    handleCookingRequest(socket, data, processingCtx),
  );
  registry.register("cookingRequest", (socket, data) =>
    handleCookingRequest(socket, data, processingCtx),
  );
  registry.register("onSmeltingSourceInteract", (socket, data) =>
    handleSmeltingSourceInteract(socket, data, processingCtx),
  );
  registry.register("onSmithingSourceInteract", (socket, data) =>
    handleSmithingSourceInteract(socket, data, processingCtx),
  );
  registry.register("onProcessingSmelting", (socket, data) =>
    handleProcessingSmelting(socket, data, processingCtx),
  );
  registry.register("onProcessingSmithing", (socket, data) =>
    handleProcessingSmithing(socket, data, processingCtx),
  );
  registry.register("onCraftingSourceInteract", (socket, data) =>
    handleCraftingSourceInteract(socket, data, processingCtx),
  );
  registry.register("onProcessingCrafting", (socket, data) =>
    handleProcessingCrafting(socket, data, processingCtx),
  );
  registry.register("onFletchingSourceInteract", (socket, data) =>
    handleFletchingSourceInteract(socket, data, processingCtx),
  );
  registry.register("onProcessingFletching", (socket, data) =>
    handleProcessingFletching(socket, data, processingCtx),
  );
  registry.register("onProcessingTanning", (socket, data) =>
    handleProcessingTanning(socket, data, processingCtx),
  );
  registry.register("onRunecraftingAltarInteract", (socket, data) =>
    handleRunecraftingAltarInteract(socket, data, processingCtx),
  );
  registry.register("runecraftingAltarInteract", (socket, data) =>
    handleRunecraftingAltarInteract(socket, data, processingCtx),
  );

  // Bank handlers — all world-only. Each registered under both `onX` and
  // legacy alias `x` for client-compat (ServerNetwork used to alias these
  // in its static dict; we preserve that exactly).
  const bankOpen = (
    socket: Parameters<typeof handleBankOpen>[0],
    data: unknown,
  ) => handleBankOpen(socket, data as BankOpenPayload, world);
  registry.register("onBankOpen", bankOpen);
  registry.register("bankOpen", bankOpen);

  const bankDeposit = (
    socket: Parameters<typeof handleBankDeposit>[0],
    data: unknown,
  ) => handleBankDeposit(socket, data as BankDepositPayload, world);
  registry.register("onBankDeposit", bankDeposit);
  registry.register("bankDeposit", bankDeposit);

  const bankWithdraw = (
    socket: Parameters<typeof handleBankWithdraw>[0],
    data: unknown,
  ) => handleBankWithdraw(socket, data as BankWithdrawPayload, world);
  registry.register("onBankWithdraw", bankWithdraw);
  registry.register("bankWithdraw", bankWithdraw);

  const bankDepositAll = (
    socket: Parameters<typeof handleBankDepositAll>[0],
    data: unknown,
  ) => handleBankDepositAll(socket, data as BankDepositAllPayload, world);
  registry.register("onBankDepositAll", bankDepositAll);
  registry.register("bankDepositAll", bankDepositAll);

  const bankDepositCoins = (
    socket: Parameters<typeof handleBankDepositCoins>[0],
    data: unknown,
  ) => handleBankDepositCoins(socket, data as CoinAmountPayload, world);
  registry.register("onBankDepositCoins", bankDepositCoins);
  registry.register("bankDepositCoins", bankDepositCoins);

  const bankWithdrawCoins = (
    socket: Parameters<typeof handleBankWithdrawCoins>[0],
    data: unknown,
  ) => handleBankWithdrawCoins(socket, data as CoinAmountPayload, world);
  registry.register("onBankWithdrawCoins", bankWithdrawCoins);
  registry.register("bankWithdrawCoins", bankWithdrawCoins);

  const bankClose = (
    socket: Parameters<typeof handleBankClose>[0],
    data: unknown,
  ) => handleBankClose(socket, data, world);
  registry.register("onBankClose", bankClose);
  registry.register("bankClose", bankClose);

  const bankMove = (
    socket: Parameters<typeof handleBankMove>[0],
    data: unknown,
  ) => handleBankMove(socket, data as BankMovePayload, world);
  registry.register("onBankMove", bankMove);
  registry.register("bankMove", bankMove);

  const bankCreateTab = (
    socket: Parameters<typeof handleBankCreateTab>[0],
    data: unknown,
  ) => handleBankCreateTab(socket, data as BankCreateTabPayload, world);
  registry.register("onBankCreateTab", bankCreateTab);
  registry.register("bankCreateTab", bankCreateTab);

  const bankDeleteTab = (
    socket: Parameters<typeof handleBankDeleteTab>[0],
    data: unknown,
  ) => handleBankDeleteTab(socket, data as BankDeleteTabPayload, world);
  registry.register("onBankDeleteTab", bankDeleteTab);
  registry.register("bankDeleteTab", bankDeleteTab);

  const bankMoveToTab = (
    socket: Parameters<typeof handleBankMoveToTab>[0],
    data: unknown,
  ) => handleBankMoveToTab(socket, data as BankMoveToTabPayload, world);
  registry.register("onBankMoveToTab", bankMoveToTab);
  registry.register("bankMoveToTab", bankMoveToTab);

  const bankWithdrawPlaceholder = (
    socket: Parameters<typeof handleBankWithdrawPlaceholder>[0],
    data: unknown,
  ) => handleBankWithdrawPlaceholder(socket, data as BankItemPayload, world);
  registry.register("onBankWithdrawPlaceholder", bankWithdrawPlaceholder);
  registry.register("bankWithdrawPlaceholder", bankWithdrawPlaceholder);

  const bankReleasePlaceholder = (
    socket: Parameters<typeof handleBankReleasePlaceholder>[0],
    data: unknown,
  ) => handleBankReleasePlaceholder(socket, data as BankSlotPayload, world);
  registry.register("onBankReleasePlaceholder", bankReleasePlaceholder);
  registry.register("bankReleasePlaceholder", bankReleasePlaceholder);

  const bankReleaseAllPlaceholders = (
    socket: Parameters<typeof handleBankReleaseAllPlaceholders>[0],
    data: unknown,
  ) => handleBankReleaseAllPlaceholders(socket, data, world);
  registry.register("onBankReleaseAllPlaceholders", bankReleaseAllPlaceholders);
  registry.register("bankReleaseAllPlaceholders", bankReleaseAllPlaceholders);

  const bankToggleAlwaysPlaceholder = (
    socket: Parameters<typeof handleBankToggleAlwaysPlaceholder>[0],
    data: unknown,
  ) => handleBankToggleAlwaysPlaceholder(socket, data, world);
  registry.register(
    "onBankToggleAlwaysPlaceholder",
    bankToggleAlwaysPlaceholder,
  );
  registry.register("bankToggleAlwaysPlaceholder", bankToggleAlwaysPlaceholder);

  const bankWithdrawToEquipment = (
    socket: Parameters<typeof handleBankWithdrawToEquipment>[0],
    data: unknown,
  ) =>
    handleBankWithdrawToEquipment(
      socket,
      data as BankWithdrawToEquipmentPayload,
      world,
    );
  registry.register("onBankWithdrawToEquipment", bankWithdrawToEquipment);
  registry.register("bankWithdrawToEquipment", bankWithdrawToEquipment);

  const bankDepositEquipment = (
    socket: Parameters<typeof handleBankDepositEquipment>[0],
    data: unknown,
  ) =>
    handleBankDepositEquipment(
      socket,
      data as BankDepositEquipmentPayload,
      world,
    );
  registry.register("onBankDepositEquipment", bankDepositEquipment);
  registry.register("bankDepositEquipment", bankDepositEquipment);

  const bankDepositAllEquipment = (
    socket: Parameters<typeof handleBankDepositAllEquipment>[0],
    data: unknown,
  ) => handleBankDepositAllEquipment(socket, data, world);
  registry.register("onBankDepositAllEquipment", bankDepositAllEquipment);
  registry.register("bankDepositAllEquipment", bankDepositAllEquipment);

  const requestBankState = (
    socket: Parameters<typeof handleRequestBankState>[0],
    data: unknown,
  ) => handleRequestBankState(socket, data, world);
  registry.register("onRequestBankState", requestBankState);
  registry.register("requestBankState", requestBankState);

  // Keepalive — intentional no-op, but registered so ServerNetwork logs
  // don't treat the packet as unknown. Client sends these to keep
  // Cloudflare/reverse-proxy WebSocket connections from idling out.
  const keepaliveNoop = () => {};
  registry.register("onKeepalive", keepaliveNoop);
  registry.register("keepalive", keepaliveNoop);

  // Dialogue handlers — all world-only.
  registry.register("onDialogueResponse", (socket, data) =>
    handleDialogueResponse(socket, data as DialogueResponsePayload, world),
  );
  registry.register("onDialogueContinue", (socket, data) =>
    handleDialogueContinue(socket, data as DialogueNpcPayload, world),
  );
  registry.register("onDialogueClose", (socket, data) =>
    handleDialogueClose(socket, data as DialogueNpcPayload, world),
  );

  // Quest list/detail queries — world-only.
  const getQuestList = (
    socket: Parameters<typeof handleGetQuestList>[0],
    data: unknown,
  ) => handleGetQuestList(socket, data as Record<string, unknown>, world);
  registry.register("onGetQuestList", getQuestList);
  registry.register("getQuestList", getQuestList);

  const getQuestDetail = (
    socket: Parameters<typeof handleGetQuestDetail>[0],
    data: unknown,
  ) => handleGetQuestDetail(socket, data as QuestIdPayload, world);
  registry.register("onGetQuestDetail", getQuestDetail);
  registry.register("getQuestDetail", getQuestDetail);

  // Combat-style toggles — world-only.
  registry.register("onChangeAttackStyle", (socket, data) =>
    handleChangeAttackStyle(socket, data, world),
  );
  registry.register("onSetAutoRetaliate", (socket, data) =>
    handleSetAutoRetaliate(socket, data, world),
  );

  // Inventory/item handlers — world-only (one exception: onCoinPouchWithdraw
  // uses `CoinAmountPayload`).
  registry.register("onPickupItem", (socket, data) =>
    handlePickupItem(socket, data, world),
  );
  registry.register("onDropItem", (socket, data) =>
    handleDropItem(socket, data, world),
  );
  registry.register("onEquipItem", (socket, data) =>
    handleEquipItem(socket, data, world),
  );
  registry.register("onUseItem", (socket, data) =>
    handleUseItem(socket, data, world),
  );
  registry.register("onUnequipItem", (socket, data) =>
    handleUnequipItem(socket, data, world),
  );
  registry.register("onMoveItem", (socket, data) =>
    handleMoveItem(socket, data, world),
  );
  registry.register("onCoinPouchWithdraw", (socket, data) =>
    handleCoinPouchWithdraw(socket, data as CoinAmountPayload, world),
  );
  registry.register("onXpLampUse", (socket, data) =>
    handleXpLampUse(socket, data, world),
  );

  // Prayer handlers — world-only. Each has an `onX` primary + legacy `x` alias.
  const prayerToggle = (
    socket: Parameters<typeof handlePrayerToggle>[0],
    data: unknown,
  ) => handlePrayerToggle(socket, data, world);
  registry.register("onPrayerToggle", prayerToggle);
  registry.register("prayerToggle", prayerToggle);

  const prayerDeactivateAll = (
    socket: Parameters<typeof handlePrayerDeactivateAll>[0],
    data: unknown,
  ) => handlePrayerDeactivateAll(socket, data, world);
  registry.register("onPrayerDeactivateAll", prayerDeactivateAll);
  registry.register("prayerDeactivateAll", prayerDeactivateAll);

  const altarPray = (
    socket: Parameters<typeof handleAltarPray>[0],
    data: unknown,
  ) => handleAltarPray(socket, data, world);
  registry.register("onAltarPray", altarPray);
  registry.register("altarPray", altarPray);

  // Magic: autocast spell selection — world-only.
  const setAutocast = (
    socket: Parameters<typeof handleSetAutocast>[0],
    data: unknown,
  ) => handleSetAutocast(socket, data, world);
  registry.register("onSetAutocast", setAutocast);
  registry.register("setAutocast", setAutocast);

  // Action bar handlers — world-only.
  const actionBarSave = (
    socket: Parameters<typeof handleActionBarSave>[0],
    data: unknown,
  ) => handleActionBarSave(socket, data, world);
  registry.register("onActionBarSave", actionBarSave);
  registry.register("actionBarSave", actionBarSave);

  const actionBarLoad = (
    socket: Parameters<typeof handleActionBarLoad>[0],
    data: unknown,
  ) => handleActionBarLoad(socket, data, world);
  registry.register("onActionBarLoad", actionBarLoad);
  registry.register("actionBarLoad", actionBarLoad);

  // Corpse loot-all — inline handler in ServerNetwork (just emits an event).
  // Reproduce that shape here; no handler module needed.
  const corpseLootAll = (
    socket: { player?: { id: string } },
    data: unknown,
  ) => {
    const player = socket.player;
    if (!player) return;
    const payload = data as CorpseLootAllPayload;
    if (!payload.corpseId) return;
    world.emit(EventType.CORPSE_LOOT_ALL_REQUEST, {
      corpseId: payload.corpseId,
      playerId: player.id,
    });
  };
  registry.register("onCorpseLootAll", corpseLootAll);
  registry.register("corpseLootAll", corpseLootAll);

  // Home teleport handlers — need current game tick (exposed via network
  // getter) plus world. Both `onHomeTeleport` and legacy `homeTeleport`.
  const homeTeleport = (
    socket: Parameters<typeof handleHomeTeleport>[0],
    data: unknown,
  ) => handleHomeTeleport(socket, data, world, network.getCurrentTick());
  registry.register("onHomeTeleport", homeTeleport);
  registry.register("homeTeleport", homeTeleport);

  const homeTeleportCancel = (
    socket: Parameters<typeof handleHomeTeleportCancel>[0],
    data: unknown,
  ) => handleHomeTeleportCancel(socket, data);
  registry.register("onHomeTeleportCancel", homeTeleportCancel);
  registry.register("homeTeleportCancel", homeTeleportCancel);

  // Character selection handlers — list/create/selected. Create and selected
  // use `broadcast.sendToSocket` for ack messages, list is world-only.
  const sendToSocket = broadcast.sendToSocket.bind(broadcast);

  const characterListRequest = (
    socket: Parameters<typeof handleCharacterListRequest>[0],
  ) => {
    void handleCharacterListRequest(socket, world);
  };
  registry.register("onCharacterListRequest", characterListRequest);
  registry.register("characterListRequest", characterListRequest);

  const characterCreate = (
    socket: Parameters<typeof handleCharacterCreate>[0],
    data: unknown,
  ) => {
    void handleCharacterCreate(socket, data, world, sendToSocket);
  };
  registry.register("onCharacterCreate", characterCreate);
  registry.register("characterCreate", characterCreate);

  const characterSelected = (
    socket: Parameters<typeof handleCharacterSelected>[0],
    data: unknown,
  ) => handleCharacterSelected(socket, data, sendToSocket);
  registry.register("onCharacterSelected", characterSelected);
  registry.register("characterSelected", characterSelected);

  // Player name change — broadcasts to all clients on success. Reuses the
  // `sendToAll` binding created above for chat/entity-modified handlers.
  const changePlayerName = (
    socket: Parameters<typeof handleChangePlayerName>[0],
    data: unknown,
  ) => handleChangePlayerName(socket, data, world, sendToAll);
  registry.register("changePlayerName", changePlayerName);

  // Death/respawn — inline handler: validates player is actually dead,
  // then emits PLAYER_RESPAWN_REQUEST. Preserves original behavior from
  // ServerNetwork/index.ts::registerHandlers().
  registry.register("onRequestRespawn", (socket) => {
    const playerEntity = socket.player;
    if (!playerEntity) {
      console.warn(
        "[ServerNetwork] requestRespawn: no player entity on socket",
      );
      return;
    }
    const entityData = playerEntity.data as
      | { deathState?: DeathState }
      | undefined;
    const isDead =
      entityData?.deathState === DeathState.DYING ||
      entityData?.deathState === DeathState.DEAD;
    if (!isDead) {
      console.warn(
        `[ServerNetwork] Rejected respawn request from ${playerEntity.id} - player is not dead`,
      );
      return;
    }
    console.log(
      `[ServerNetwork] Received respawn request from player ${playerEntity.id}`,
    );
    world.emit(EventType.PLAYER_RESPAWN_REQUEST, {
      playerId: playerEntity.id,
    });
  });

  // NPC interaction — client clicked on NPC. Inline handler emits
  // NPC_INTERACTION event for DialogueSystem to consume.
  registry.register("onNpcInteract", (socket, data) => {
    const playerEntity = socket.player;
    if (!playerEntity) return;
    const payload = data as NpcInteractPayload;
    world.emit(EventType.NPC_INTERACTION, {
      playerId: playerEntity.id,
      npcId: payload.npcId,
      npc: payload.npc,
      npcEntityId: payload.npcId,
    });
  });

  // Generic entity interaction — for entities like starter chests.
  // Looks up entity and calls its `handleInteraction` method if present.
  const entityInteract = async (
    socket: {
      player?: { id: string; position?: { x: number; y: number; z: number } };
    },
    data: unknown,
  ) => {
    const playerEntity = socket.player;
    if (!playerEntity) {
      console.warn(
        "[ServerNetwork] entityInteract: no player entity on socket",
      );
      return;
    }
    const payload = data as EntityInteractPayload;
    console.log(
      `[ServerNetwork] entityInteract received: entityId=${payload.entityId}, interactionType=${payload.interactionType}, playerId=${playerEntity.id}`,
    );
    if (!payload.entityId) {
      console.warn("[ServerNetwork] entityInteract missing entityId");
      return;
    }
    const entity = world.entities.get(payload.entityId);
    if (!entity) {
      console.warn(
        `[ServerNetwork] entityInteract: entity ${payload.entityId} not found`,
      );
      return;
    }
    console.log(
      `[ServerNetwork] Found entity: type=${entity.type}, name=${entity.name}`,
    );
    const interactableEntity = entity as unknown as {
      handleInteraction?: (data: {
        playerId: string;
        entityId: string;
        interactionType: string;
        position: { x: number; y: number; z: number };
        playerPosition: { x: number; y: number; z: number };
      }) => Promise<void>;
    };
    if (typeof interactableEntity.handleInteraction === "function") {
      console.log(
        `[ServerNetwork] Calling handleInteraction on ${entity.type} entity`,
      );
      try {
        const entityPos = entity.position ?? { x: 0, y: 0, z: 0 };
        const playerPos = playerEntity.position ?? { x: 0, y: 0, z: 0 };
        await interactableEntity.handleInteraction({
          playerId: playerEntity.id,
          entityId: payload.entityId,
          interactionType: payload.interactionType || "interact",
          position: { x: entityPos.x, y: entityPos.y, z: entityPos.z },
          playerPosition: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
        });
        console.log(
          `[ServerNetwork] handleInteraction completed for ${entity.type}`,
        );
      } catch (err) {
        console.error(`[ServerNetwork] Error in entity interaction: ${err}`);
      }
    } else {
      console.warn(
        `[ServerNetwork] Entity ${payload.entityId} has no handleInteraction method`,
      );
    }
  };
  registry.register("onEntityInteract", entityInteract);
  registry.register("entityInteract", entityInteract);

  // Quest mutations — accept/abandon/complete. Each has `on*` + legacy alias.
  const questAccept = (
    socket: Parameters<typeof handleQuestAccept>[0],
    data: unknown,
  ) => {
    void handleQuestAccept(socket, data as QuestIdPayload, world);
  };
  registry.register("onQuestAccept", questAccept);
  registry.register("questAccept", questAccept);

  const questAbandon = (
    socket: Parameters<typeof handleQuestAbandon>[0],
    data: unknown,
  ) => {
    void handleQuestAbandon(socket, data as QuestIdPayload, world);
  };
  registry.register("onQuestAbandon", questAbandon);
  registry.register("questAbandon", questAbandon);

  const questComplete = (
    socket: Parameters<typeof handleQuestComplete>[0],
    data: unknown,
  ) => {
    void handleQuestComplete(socket, data as QuestIdPayload, world);
  };
  registry.register("onQuestComplete", questComplete);
  registry.register("questComplete", questComplete);

  // Store handlers — coupled to drizzle/Postgres, stay in server for now.
  registry.register("onStoreOpen", (socket, data) =>
    handleStoreOpen(socket, data as StoreOpenPayload, world),
  );
  registry.register("onStoreBuy", (socket, data) =>
    handleStoreBuy(socket, data as StoreItemPayload, world),
  );
  registry.register("onStoreSell", (socket, data) =>
    handleStoreSell(socket, data as StoreItemPayload, world),
  );
  registry.register("onStoreClose", (socket, data) =>
    handleStoreClose(socket, data as StoreClosePayload, world),
  );

  // Trade handlers — request/respond are world-only; add-item/set-quantity/
  // accept require a DatabaseConnection obtained via `getDatabase(world)`.
  // Each registered under both `onX` and legacy alias `x`.
  const tradeRequest = (
    socket: Parameters<typeof handleTradeRequest>[0],
    data: unknown,
  ) => handleTradeRequest(socket, data as TradeRequestPayload, world);
  registry.register("onTradeRequest", tradeRequest);
  registry.register("tradeRequest", tradeRequest);

  const tradeRequestRespond = (
    socket: Parameters<typeof handleTradeRequestRespond>[0],
    data: unknown,
  ) => handleTradeRequestRespond(socket, data as TradeRespondPayload, world);
  registry.register("onTradeRequestRespond", tradeRequestRespond);
  registry.register("tradeRequestRespond", tradeRequestRespond);

  const tradeAddItem = (
    socket: Parameters<typeof handleTradeAddItem>[0],
    data: unknown,
  ) => {
    const db = getDatabase(world);
    if (!db) {
      console.error(
        "[ServerNetwork] Database not available for trade add item",
      );
      return;
    }
    void handleTradeAddItem(socket, data as TradeItemPayload, world, db);
  };
  registry.register("onTradeAddItem", tradeAddItem);
  registry.register("tradeAddItem", tradeAddItem);

  const tradeRemoveItem = (
    socket: Parameters<typeof handleTradeRemoveItem>[0],
    data: unknown,
  ) => handleTradeRemoveItem(socket, data as TradeSlotPayload, world);
  registry.register("onTradeRemoveItem", tradeRemoveItem);
  registry.register("tradeRemoveItem", tradeRemoveItem);

  const tradeSetItemQuantity = (
    socket: Parameters<typeof handleTradeSetQuantity>[0],
    data: unknown,
  ) => {
    const db = getDatabase(world);
    if (!db) {
      console.error(
        "[ServerNetwork] Database not available for trade set quantity",
      );
      return;
    }
    void handleTradeSetQuantity(
      socket,
      data as TradeSetQuantityPayload,
      world,
      db,
    );
  };
  registry.register("onTradeSetItemQuantity", tradeSetItemQuantity);
  registry.register("tradeSetItemQuantity", tradeSetItemQuantity);

  const tradeAccept = (
    socket: Parameters<typeof handleTradeAccept>[0],
    data: unknown,
  ) => {
    const db = getDatabase(world);
    if (!db) {
      console.error("[ServerNetwork] Database not available for trade accept");
      return;
    }
    void handleTradeAccept(socket, data as TradeIdPayload, world, db);
  };
  registry.register("onTradeAccept", tradeAccept);
  registry.register("tradeAccept", tradeAccept);

  const tradeCancelAccept = (
    socket: Parameters<typeof handleTradeCancelAccept>[0],
    data: unknown,
  ) => handleTradeCancelAccept(socket, data as TradeIdPayload, world);
  registry.register("onTradeCancelAccept", tradeCancelAccept);
  registry.register("tradeCancelAccept", tradeCancelAccept);

  const tradeCancel = (
    socket: Parameters<typeof handleTradeCancel>[0],
    data: unknown,
  ) => handleTradeCancel(socket, data as TradeIdPayload, world);
  registry.register("onTradeCancel", tradeCancel);
  registry.register("tradeCancel", tradeCancel);

  // Duel handlers. The client uses colon-delimited packet names
  // (`duel:challenge`, `duel:toggle:rule`, etc.) plus `onDuel:*` forms added
  // by packet transformation. Stakes handlers require a DatabaseConnection.
  const duelChallenge = (
    socket: Parameters<typeof handleDuelChallenge>[0],
    data: unknown,
  ) => handleDuelChallenge(socket, data as DuelChallengePayload, world);
  registry.register("onDuelChallenge", duelChallenge);
  registry.register("duel:challenge", duelChallenge);
  registry.register("onDuel:challenge", duelChallenge);

  const duelChallengeRespond = (
    socket: Parameters<typeof handleDuelChallengeRespond>[0],
    data: unknown,
  ) =>
    handleDuelChallengeRespond(
      socket,
      data as DuelChallengeRespondPayload,
      world,
    );
  registry.register("onDuelChallengeRespond", duelChallengeRespond);
  registry.register("duel:challenge:respond", duelChallengeRespond);
  registry.register("onDuel:challenge:respond", duelChallengeRespond);

  const duelToggleRule = (
    socket: Parameters<typeof handleDuelToggleRule>[0],
    data: unknown,
  ) => handleDuelToggleRule(socket, data as DuelToggleRulePayload, world);
  registry.register("duel:toggle:rule", duelToggleRule);
  registry.register("onDuel:toggle:rule", duelToggleRule);

  const duelToggleEquipment = (
    socket: Parameters<typeof handleDuelToggleEquipment>[0],
    data: unknown,
  ) =>
    handleDuelToggleEquipment(
      socket,
      data as DuelToggleEquipmentPayload,
      world,
    );
  registry.register("duel:toggle:equipment", duelToggleEquipment);
  registry.register("onDuel:toggle:equipment", duelToggleEquipment);

  const duelAcceptRules = (
    socket: Parameters<typeof handleDuelAcceptRules>[0],
    data: unknown,
  ) => handleDuelAcceptRules(socket, data as DuelIdPayload, world);
  registry.register("duel:accept:rules", duelAcceptRules);
  registry.register("onDuel:accept:rules", duelAcceptRules);

  const duelCancel = (
    socket: Parameters<typeof handleDuelCancel>[0],
    data: unknown,
  ) => handleDuelCancel(socket, data as DuelIdPayload, world);
  registry.register("duel:cancel", duelCancel);
  registry.register("onDuel:cancel", duelCancel);

  const duelAddStake = (
    socket: Parameters<typeof handleDuelAddStake>[0],
    data: unknown,
  ) => {
    const db = getDatabase(world);
    if (!db) {
      console.error(
        "[ServerNetwork] Database not available for duel add stake",
      );
      return;
    }
    void handleDuelAddStake(socket, data as DuelAddStakePayload, world, db);
  };
  registry.register("duel:add:stake", duelAddStake);
  registry.register("onDuel:add:stake", duelAddStake);

  const duelRemoveStake = (
    socket: Parameters<typeof handleDuelRemoveStake>[0],
    data: unknown,
  ) => {
    const db = getDatabase(world);
    if (!db) {
      console.error(
        "[ServerNetwork] Database not available for duel remove stake",
      );
      return;
    }
    void handleDuelRemoveStake(
      socket,
      data as DuelRemoveStakePayload,
      world,
      db,
    );
  };
  registry.register("duel:remove:stake", duelRemoveStake);
  registry.register("onDuel:remove:stake", duelRemoveStake);

  const duelAcceptStakes = (
    socket: Parameters<typeof handleDuelAcceptStakes>[0],
    data: unknown,
  ) => handleDuelAcceptStakes(socket, data as DuelIdPayload, world);
  registry.register("duel:accept:stakes", duelAcceptStakes);
  registry.register("onDuel:accept:stakes", duelAcceptStakes);

  const duelAcceptFinal = (
    socket: Parameters<typeof handleDuelAcceptFinal>[0],
    data: unknown,
  ) => handleDuelAcceptFinal(socket, data as DuelIdPayload, world);
  registry.register("duel:accept:final", duelAcceptFinal);
  registry.register("onDuel:accept:final", duelAcceptFinal);

  const duelForfeit = (
    socket: Parameters<typeof handleDuelForfeit>[0],
    data: unknown,
  ) => handleDuelForfeit(socket, data as DuelIdPayload, world);
  registry.register("duel:forfeit", duelForfeit);
  registry.register("onDuel:forfeit", duelForfeit);

  // Friend / social / private-message handlers — all world-only. Each has
  // `onX` + legacy `x` alias.
  const friendRequest = (
    socket: Parameters<typeof handleFriendRequest>[0],
    data: unknown,
  ) => handleFriendRequest(socket, data as FriendTargetNamePayload, world);
  registry.register("onFriendRequest", friendRequest);
  registry.register("friendRequest", friendRequest);

  const friendAccept = (
    socket: Parameters<typeof handleFriendAccept>[0],
    data: unknown,
  ) => handleFriendAccept(socket, data as FriendRequestIdPayload, world);
  registry.register("onFriendAccept", friendAccept);
  registry.register("friendAccept", friendAccept);

  const friendDecline = (
    socket: Parameters<typeof handleFriendDecline>[0],
    data: unknown,
  ) => handleFriendDecline(socket, data as FriendRequestIdPayload, world);
  registry.register("onFriendDecline", friendDecline);
  registry.register("friendDecline", friendDecline);

  const friendRemove = (
    socket: Parameters<typeof handleFriendRemove>[0],
    data: unknown,
  ) => handleFriendRemove(socket, data as FriendIdPayload, world);
  registry.register("onFriendRemove", friendRemove);
  registry.register("friendRemove", friendRemove);

  const ignoreAdd = (
    socket: Parameters<typeof handleIgnoreAdd>[0],
    data: unknown,
  ) => handleIgnoreAdd(socket, data as FriendTargetNamePayload, world);
  registry.register("onIgnoreAdd", ignoreAdd);
  registry.register("ignoreAdd", ignoreAdd);

  const ignoreRemove = (
    socket: Parameters<typeof handleIgnoreRemove>[0],
    data: unknown,
  ) => handleIgnoreRemove(socket, data as IgnoreIdPayload, world);
  registry.register("onIgnoreRemove", ignoreRemove);
  registry.register("ignoreRemove", ignoreRemove);

  const privateMessage = (
    socket: Parameters<typeof handlePrivateMessage>[0],
    data: unknown,
  ) => handlePrivateMessage(socket, data as PrivateMessagePayload, world);
  registry.register("onPrivateMessage", privateMessage);
  registry.register("privateMessage", privateMessage);
}
