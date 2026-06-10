/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/private_vote_tee.json`.
 */
export type PrivateVoteTee = {
  "address": "G4vWCSbtuasRvfB3X42QhfUBZ7ecpKPvQnKrutDj5yaY",
  "metadata": {
    "name": "privateVoteTee",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "MagicBlock TEE variant of private_vote — Arcium-free, delegate-aware."
  },
  "instructions": [
    {
      "name": "castVote",
      "discriminator": [
        20,
        212,
        15,
        189,
        69,
        180,
        69,
        151
      ],
      "accounts": [
        {
          "name": "voter",
          "signer": true
        },
        {
          "name": "voteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vote_state.multisig",
                "account": "voteStateAccount"
              },
              {
                "kind": "account",
                "path": "vote_state.transaction_index",
                "account": "voteStateAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "choice",
          "type": "bool"
        }
      ]
    },
    {
      "name": "cpiProposalApprove",
      "discriminator": [
        66,
        212,
        224,
        217,
        229,
        212,
        136,
        111
      ],
      "accounts": [
        {
          "name": "trigger",
          "signer": true
        },
        {
          "name": "voteState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vote_state.multisig",
                "account": "voteStateAccount"
              },
              {
                "kind": "account",
                "path": "vote_state.transaction_index",
                "account": "voteStateAccount"
              }
            ]
          }
        },
        {
          "name": "multisig"
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "memberAuthority",
          "docs": [
            "Arcium-based private_vote wrapper so the two backends can coexist."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  101,
                  95,
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vote_state.multisig",
                "account": "voteStateAccount"
              }
            ]
          }
        },
        {
          "name": "squadsProgram",
          "address": "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
        }
      ],
      "args": []
    },
    {
      "name": "delegateForTee",
      "discriminator": [
        176,
        120,
        55,
        139,
        36,
        98,
        58,
        18
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "bufferVoteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "voteState"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                223,
                224,
                138,
                245,
                170,
                1,
                176,
                74,
                130,
                72,
                133,
                25,
                247,
                78,
                33,
                145,
                208,
                72,
                58,
                78,
                159,
                98,
                46,
                87,
                98,
                246,
                101,
                58,
                68,
                40,
                217,
                249
              ]
            }
          }
        },
        {
          "name": "delegationRecordVoteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "voteState"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataVoteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "voteState"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "voteState",
          "docs": [
            "(multisig, transaction_index) args. Must be raw AccountInfo because",
            "the SDK takes ownership of the account at delegation time."
          ],
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "G4vWCSbtuasRvfB3X42QhfUBZ7ecpKPvQnKrutDj5yaY"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "multisig",
          "type": "pubkey"
        },
        {
          "name": "transactionIndex",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeAndCommit",
      "discriminator": [
        212,
        90,
        133,
        149,
        118,
        246,
        105,
        213
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "voteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vote_state.multisig",
                "account": "voteStateAccount"
              },
              {
                "kind": "account",
                "path": "vote_state.transaction_index",
                "account": "voteStateAccount"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initVoteState",
      "discriminator": [
        61,
        107,
        87,
        124,
        190,
        218,
        94,
        193
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "voteState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "multisig"
              },
              {
                "kind": "arg",
                "path": "transactionIndex"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "multisig",
          "type": "pubkey"
        },
        {
          "name": "transactionIndex",
          "type": "u64"
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "members",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "voteStateAccount",
      "discriminator": [
        86,
        74,
        133,
        22,
        179,
        217,
        129,
        229
      ]
    }
  ],
  "events": [
    {
      "name": "finalizedEvent",
      "discriminator": [
        206,
        250,
        120,
        252,
        53,
        19,
        197,
        196
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidThreshold",
      "msg": "Threshold must be at least 1"
    },
    {
      "code": 6001,
      "name": "invalidMemberCount",
      "msg": "Invalid member count (1..=8)"
    },
    {
      "code": 6002,
      "name": "thresholdExceedsMembers",
      "msg": "Threshold exceeds member count"
    },
    {
      "code": 6003,
      "name": "notAMember",
      "msg": "Caller is not a member of this multisig"
    },
    {
      "code": 6004,
      "name": "alreadyVoted",
      "msg": "This member has already voted"
    },
    {
      "code": 6005,
      "name": "alreadyFinalized",
      "msg": "Vote is already finalized"
    },
    {
      "code": 6006,
      "name": "notFinalized",
      "msg": "Vote not finalized yet"
    },
    {
      "code": 6007,
      "name": "notApproved",
      "msg": "Vote finalized but rejected"
    },
    {
      "code": 6008,
      "name": "invalidPda",
      "msg": "vote_state account does not match (multisig, transaction_index) seeds"
    }
  ],
  "types": [
    {
      "name": "finalizedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transactionIndex",
            "type": "u64"
          },
          {
            "name": "approved",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "voteStateAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transactionIndex",
            "type": "u64"
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "memberCount",
            "type": "u8"
          },
          {
            "name": "members",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "votedBitmap",
            "type": "u128"
          },
          {
            "name": "yesCount",
            "type": "u8"
          },
          {
            "name": "noCount",
            "type": "u8"
          },
          {
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
