export const DUEL_OUTCOME_ORACLE_ABI = [
  {
    type: "function",
    name: "upsertDuel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "duelKey", type: "bytes32" },
      { name: "participantAHash", type: "bytes32" },
      { name: "participantBHash", type: "bytes32" },
      { name: "betOpenTs", type: "uint64" },
      { name: "betCloseTs", type: "uint64" },
      { name: "duelStartTs", type: "uint64" },
      { name: "metadataUri", type: "string" },
      { name: "status", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelDuel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "duelKey", type: "bytes32" },
      { name: "metadataUri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reportResult",
    stateMutability: "nonpayable",
    inputs: [
      { name: "duelKey", type: "bytes32" },
      { name: "winner", type: "uint8" },
      { name: "seed", type: "uint64" },
      { name: "replayHash", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "duelEndTs", type: "uint64" },
      { name: "metadataUri", type: "string" },
    ],
    outputs: [],
  },
] as const;
