import {
  MusicStateMachineManifestSchema,
  MusicStateMachineSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  MusicStateController,
  MusicStateMachineRegistry,
  UnknownMusicStateError,
  UnknownMusicStateMachineError,
} from "../MusicStateController.js";

function machine() {
  return MusicStateMachineSchema.parse({
    id: "overworld",
    name: "Overworld FSM",
    initial: "explore",
    states: [
      {
        id: "explore",
        name: "Explore",
        musicId: "track.explore",
        transitions: [
          { to: "combat", when: "inCombat", priority: 10, fadeSec: 1 },
          {
            to: "boss",
            when: "bossActive",
            priority: 100,
            fadeSec: 0.5,
            stingerId: "sting.boss",
          },
        ],
      },
      {
        id: "combat",
        name: "Combat",
        musicId: "track.combat",
        transitions: [
          { to: "explore", when: "", priority: 0, fadeSec: 4 },
          {
            to: "boss",
            when: "bossActive",
            priority: 100,
            fadeSec: 0.5,
            stingerId: "sting.boss",
          },
          { to: "victory", when: "justWon", priority: 50 },
        ],
      },
      {
        id: "boss",
        name: "Boss",
        musicId: "track.boss",
        transitions: [
          { to: "victory", when: "bossDefeated", priority: 100 },
          { to: "explore", when: "bossFled", priority: 50 },
        ],
      },
      {
        id: "victory",
        name: "Victory",
        musicId: "track.victory",
        loop: false,
        transitions: [{ to: "explore", when: "victoryDone", priority: 10 }],
      },
    ],
  });
}

describe("MusicStateController — basics", () => {
  it("starts in initial state", () => {
    const c = new MusicStateController(machine());
    expect(c.currentStateId).toBe("explore");
    expect(c.currentState.musicId).toBe("track.explore");
  });

  it("tick with no satisfied predicates stays put", () => {
    const c = new MusicStateController(machine());
    expect(c.tick({})).toBeNull();
    expect(c.currentStateId).toBe("explore");
  });

  it("tick with satisfied predicate transitions", () => {
    const c = new MusicStateController(machine());
    const evt = c.tick({ inCombat: true });
    expect(evt).not.toBeNull();
    expect(evt!.fromStateId).toBe("explore");
    expect(evt!.toStateId).toBe("combat");
    expect(evt!.toState.musicId).toBe("track.combat");
    expect(evt!.transition.fadeSec).toBe(1);
    expect(c.currentStateId).toBe("combat");
  });

  it("default (empty-when) transition fires when nothing else wins", () => {
    const c = new MusicStateController(machine());
    c.tick({ inCombat: true }); // → combat
    const evt = c.tick({});
    // combat → explore default
    expect(evt!.toStateId).toBe("explore");
    expect(evt!.transition.fadeSec).toBe(4);
  });

  it("predicate that is explicitly false acts like missing", () => {
    const c = new MusicStateController(machine());
    const evt = c.tick({ inCombat: false });
    expect(evt).toBeNull();
  });
});

describe("MusicStateController — priority", () => {
  it("higher priority wins when multiple predicates satisfied", () => {
    const c = new MusicStateController(machine());
    const evt = c.tick({ inCombat: true, bossActive: true });
    expect(evt!.toStateId).toBe("boss");
    expect(evt!.transition.stingerId).toBe("sting.boss");
  });

  it("tie broken by manifest order", () => {
    const m = MusicStateMachineSchema.parse({
      id: "tie",
      name: "Tie",
      initial: "a",
      states: [
        {
          id: "a",
          name: "A",
          transitions: [
            { to: "b", when: "x", priority: 5 },
            { to: "c", when: "y", priority: 5 },
          ],
        },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
    });
    const c = new MusicStateController(m);
    const evt = c.tick({ x: true, y: true });
    expect(evt!.toStateId).toBe("b"); // first in manifest order
  });

  it("default transition loses to any priority>0 satisfied rule", () => {
    const c = new MusicStateController(machine());
    c.tick({ inCombat: true }); // → combat
    const evt = c.tick({ justWon: true });
    // combat has: default→explore (priority 0) + justWon→victory (priority 50)
    expect(evt!.toStateId).toBe("victory");
  });
});

describe("MusicStateController — self-transition guard", () => {
  it("returns null if the winning transition targets the current state", () => {
    const m = MusicStateMachineSchema.parse({
      id: "self",
      name: "Self",
      initial: "a",
      states: [
        {
          id: "a",
          name: "A",
          // Schema allows to-self since `to` is just a StateId referencing any state.
          // Controller guards against firing an event for a no-op self-jump.
          transitions: [{ to: "a", when: "re", priority: 10 }],
        },
      ],
    });
    const c = new MusicStateController(m);
    expect(c.tick({ re: true })).toBeNull();
    expect(c.currentStateId).toBe("a");
  });
});

describe("MusicStateController — reset + force", () => {
  it("reset returns to initial state", () => {
    const c = new MusicStateController(machine());
    c.tick({ inCombat: true, bossActive: true });
    expect(c.currentStateId).toBe("boss");
    c.reset();
    expect(c.currentStateId).toBe("explore");
  });

  it("force jumps to an arbitrary state + synthesizes transition event", () => {
    const c = new MusicStateController(machine());
    const evt = c.force("victory");
    expect(evt).not.toBeNull();
    expect(evt!.fromStateId).toBe("explore");
    expect(evt!.toStateId).toBe("victory");
    expect(evt!.transition.fadeSec).toBe(0);
    expect(c.currentStateId).toBe("victory");
  });

  it("force to current state returns null (no-op)", () => {
    const c = new MusicStateController(machine());
    expect(c.force("explore")).toBeNull();
  });

  it("force to unknown state throws UnknownMusicStateError", () => {
    const c = new MusicStateController(machine());
    expect(() => c.force("ghost")).toThrow(UnknownMusicStateError);
  });
});

describe("MusicStateMachineRegistry", () => {
  function manifest() {
    return MusicStateMachineManifestSchema.parse([
      machine(),
      MusicStateMachineSchema.parse({
        id: "dungeon",
        name: "Dungeon FSM",
        initial: "quiet",
        states: [
          {
            id: "quiet",
            name: "Quiet",
            transitions: [{ to: "danger", when: "detected", priority: 10 }],
          },
          { id: "danger", name: "Danger" },
        ],
      }),
    ]);
  }

  it("indexes machines by id", () => {
    const reg = new MusicStateMachineRegistry(manifest());
    expect(reg.size).toBe(2);
    expect(reg.ids).toEqual(expect.arrayContaining(["overworld", "dungeon"]));
  });

  it("get throws UnknownMusicStateMachineError on miss", () => {
    const reg = new MusicStateMachineRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownMusicStateMachineError);
  });

  it("createController builds a controller for the named machine", () => {
    const reg = new MusicStateMachineRegistry(manifest());
    const c = reg.createController("dungeon");
    expect(c.currentStateId).toBe("quiet");
    const evt = c.tick({ detected: true });
    expect(evt!.toStateId).toBe("danger");
  });

  it("loadFromJson validates before loading", () => {
    const reg = new MusicStateMachineRegistry();
    reg.loadFromJson([
      {
        id: "m",
        name: "M",
        initial: "s",
        states: [{ id: "s", name: "S" }],
      },
    ]);
    expect(reg.size).toBe(1);
  });
});

describe("MusicStateController — integration", () => {
  it("plays a full boss encounter arc", () => {
    const c = new MusicStateController(machine());
    // Start in explore, enter combat
    expect(c.tick({ inCombat: true })!.toStateId).toBe("combat");
    // Boss appears mid-combat
    const bossEvt = c.tick({ inCombat: true, bossActive: true });
    expect(bossEvt!.toStateId).toBe("boss");
    expect(bossEvt!.transition.stingerId).toBe("sting.boss");
    // Boss defeated
    expect(c.tick({ bossDefeated: true })!.toStateId).toBe("victory");
    // Victory jingle finishes
    expect(c.tick({ victoryDone: true })!.toStateId).toBe("explore");
  });
});
