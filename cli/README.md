# maci-cli

## Subcommands

| Role | Action | Subcommand |
|-|-|-|
| User | Generate MACI keypair | `genMaciKeypair` |
| User | Generate MACI public key | `genMaciPubkey` |
| Coordinator | Create election | `create `|
| User | Sign up | `signup` |
| User | Change key / vote | `publish` |
| Coordinator | Process one batch or all remaining batches of messages | `process` |
| Coordinator | Tally one batch or all remaining batches of state leaves | `tally` |

## Public and private key format

MACI uses private keys in the BabyJub field for operations which occur within
zk-SNARKs, such as decrypting messages or signing commands. As MACI is deployed
on Ethereum, we seek to avoid confusing BabyJub private keys with Ethereum
private keys. To that end, users should pass serialized formats of public and
private keys to this CLI. We use `maci-domainobj`'s `PrivKey.serialize` and
`PubKey.serialize` functions to do so. 

Examples of serialized public and private keys:

```
Private key: macisk.e11e7e8870b6b3472e04a1ed703306ffbc9fd4ae78eff0c8b6cb552d467ef3f
Public key:  macipk.483e37f5f4a11713d1a9c9df79fc7195f0e1e303e1d3bb823822e1930e1b2aa7
```

### Coordinator: Create election

This command deploys an instance of a MACI contract.

Note that all the example commands default to a local Ethereum testnet at
`http://localhost:8545`. For testing purposes, you can run one using:

```bash

# in maci/contracts
npm run ganache
```

Fields that the coordinator has to set:

`node build/index.js create <options>`

Example usage:

```
$ node build/index.js create -sk macisk.23d007423d56475d7e39dcd5053c5aa98f57a69ee85bc7813ccbf4c5e688307  -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 -u 15 -m 15
```

Example output:

```
MACI: 0xE28158eCFde143e2536761c3254C7C31efd97271
```

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to an Ethereum provider. Default: `http://localhost:8545` |
| Coordinator's MACI private key | `-sk` or `--privkey` | A serialized MACI private key. This is *not* an Ethereum private key. Its big-endian value must be below the snark field size. |
| Prompt for the coordinator's MACI private key | `-dsk` or `--prompt-for-maci-privkey` | If specified, ignores `-sk / --privkey` and prompts the coordinator to input their MACI private key |
| Deployer's Ethereum private key | `-d` or `--deployer-privkey` | A private key of the Ethereum account to use to deploy the MACI contract |
| Prompt for the deployer's Ethereum private key | `-dp` or `--prompt-for-deployer-privkey` | If specified, ignores `-d / --deployer-privkey` and prompts the coordinator to input their Ethereum private key |
| Maximum number of users | `-u` or `--max-users` | Default: 15 |
| Maximum number of messages | `-m` or `--max-messages` | Default: 15 |
| Maximum number of vote options | `-v` or `--max-vote-options` | Default: 25 |
| Sign-up duration | `-s` or `--signup-duration` | The sign-up duration, in seconds. Default: 3600. |
| Voting duration | `-o` or `--voting-duration` | The voting duration, in seconds. Default: 3600. |
| Initial voice credits | `-c` or `--initial-voice-credits` | Default: 100 |
| Initial voice credit proxy contract | `-i` or `--initial-vc-proxy` | If specified, deploys the MACI contract with this address as the initial voice credit proxy constructor argument. Otherwise, deploys a ConstantInitialVoiceCreditProxy contract with the above-specified value. |
| Signup gatekeeper contract | `-g` or `--signup-gatekeeper` | If specified, deploys the MACI contract with this address as the signup gatekeeper constructor argument. Otherwise, deploys a gatekeeper contract which allows any address to sign up. | 
| Batch size for processing messages | `-bm` or `--message-batch-size` | Default: 4 |
| Batch size for tallying votes | `-bv` or `--tally-batch-size` | Default: 4 |

### Coordinator: Process, tally and prove outcome

These three commands share the same option flags.

`node build/index.js process <options>`

`node build/index.js tally <options>`

`node build/index.js prove <options>`

Fields that the coordinator has to set:

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to the Ethereum provider. Default: `http://localhost:8545` |
| MACI contract address | `-x` or `--contract` | The address of the deployed MACI contract |
| Coordinator's MACI private key | `-sk` or `--privkey` | See above |
| Coordinator's Ethereum private key | `-d` or `--eth-privkey` | A private key of the Ethereum account to use to perform the transaction |
| Prompt for the coordinator's Ethereum private key | `-dp` or `--prompt-for-eth-privkey` | If specified, ignores `-d / --eth-privkey` and prompts the coordinator to input their Ethereum private key |

As message processing and vote tallying occurs in batches, this command should
automatically resume a job halfway done.

### User: Generate MACI keypair

`node build/index.js genMaciKeypair <options>`

The output of this command is a serialised private key and serialised
public key.

### User: Generate MACI public key

`node build/index.js genMaciPubkey <options>`

| Option | Flags | About |
|-|-|-|
| Private key | `-sk` or `--privKey` | A serialised private key |

The output of this command is a serialised public key derived from the given private key.

### User: Sign up

`node build/index.js signup <options>`

Fields that the user has to set:

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to the Ethereum provider. Default: `http://localhost:8545` |
| MACI contract address | `-x` or `--contract` | The address of the deployed MACI contract |
| The user's MACI public key | `-p` or `--pubkey` | This should not be an Ethereum public key. Instead, it should be the user's serialised BabyJub public key (where the x and y values have been concatenated. |
| User's Ethereum private key | `-d` or `--eth-privkey` | A private key of the Ethereum account to use to sign up |
| Prompt for the user's Ethereum private key | `-dp` or `--prompt-for-eth-privkey` | If specified, ignores `-d / --eth-privkey` and prompts the user to input their Ethereum private key |
| Signup gatekeeper proxy data | `-s` or `--sg-data` | A hex string to pass to the sign-up gatekeeper proxy contract which may use it to determine whether to allow the user to sign up. Default: an empty bytestring. |
| Initial voice credit proxy data | `-v` or `--ivcp-data` | A hex string to pass to the initial voice credit proxy contract which may use it to determine how many voice credits to assign to the user. Default: an empty bytestring. |

### User: Change key / vote

`node build/index.js publish <options>`

Fields that the user has to set:

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to the Ethereum provider. Default: `http://localhost:8545` |
| MACI contract address | `-x` or `--contract` | The address of the deployed MACI contract |
| The user's MACI private key | `-sk` or `--pubkey` | This should not be an Ethereum private key |
| Prompt for the user's MACI private key | `-dsk` or `--prompt-for-maci-privkey` | If specified, ignores `-sk / --privkey` and prompts the user to input thier MACI private key |
| User's Ethereum private key | `-d` or `--eth-privkey` | A private key of the Ethereum account to use to perform the transaction |
| Prompt for the user's Ethereum private key | `-dp` or `--prompt-for-eth-privkey` | If specified, ignores `-d / --eth-privkey` and prompts the user to input their Ethereum private key |
| State index | `-i` or `--state-index` | The state index of the user |
| The user's new or current MACI public key | `-p` or `--pubkey` | This should be a serialised BabyJub public key which should replace the user\'s public key in the state tree if the command is valid|
| Vote option index | `-v` or `--vote-option-index` | The index of the option to vote for |
| New vote weight | `-w` or `--new-vote-weight` | The vote weight to assign to said vote option |
| Nonce | `-n` or `--nonce` | The nonce of the message |
| Salt | `-s` or `--salt` | The salt of the message. If unspecified, this command will randomly generate a salt |

### Coordinator: Process messages

`NODE_OPTIONS=--max-old-space-size=4096 node build/index.js process <options>`

Fields that the coordinator has to set:

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to the Ethereum provider. Default: `http://localhost:8545` |
| MACI contract address | `-x` or `--contract` | The address of the deployed MACI contract |
| Coordinator's MACI private key | `-sk` or `--privkey` | A serialized MACI private key. This is *not* an Ethereum private key. Its big-endian value must be below the snark field size. |
| Prompt for the coordinator's MACI private key | `-dsk` or `--prompt-for-maci-privkey` | If specified, ignores `-sk / --privkey` and prompts the user to input the coordinator's MACI private key |
| Coordinator's Ethereum private key | `-d` or `--eth-privkey` | A private key of the Ethereum account to use to perform transactions |
| Prompt for the coordinator's Ethereum private key | `-dp` or `--prompt-for-eth-privkey` | If specified, ignores `-d / --eth-privkey` and prompts the coordinator to input their Ethereum private key |
| Repeat until all messages have been processed | `-r` or `--repeat` | Default: false |

### Coordinator: Tally votes

`NODE_OPTIONS=--max-old-space-size=4096 node build/index.js tally <options>`

Fields that the coordinator has to set:

| Option | Flags | About |
|-|-|-|
| Ethereum provider | `-e` or `--eth-provider` | A connection string to the Ethereum provider. Default: `http://localhost:8545` |
| MACI contract address | `-x` or `--contract` | The address of the deployed MACI contract |
| Coordinator's MACI private key | `-sk` or `--privkey` | A serialized MACI private key. This is *not* an Ethereum private key. Its big-endian value must be below the snark field size. |
| Prompt for the coordinator's MACI private key | `-dsk` or `--prompt-for-maci-privkey` | If specified, ignores `-sk / --privkey` and prompts the user to input the coordinator's MACI private key |
| Coordinator's Ethereum private key | `-d` or `--eth-privkey` | A private key of the Ethereum account to use to perform transactions |
| Prompt for the coordinator's Ethereum private key | `-dp` or `--prompt-for-eth-privkey` | If specified, ignores `-d / --eth-privkey` and prompts the coordinator to input their Ethereum private key |
| Repeat until all votes have been processed | `-r` or `--repeat` | Default: false |
| The serialised state leaf preimage at index 0 | `-z` or `--leaf-zero` | |
| The current results salt | `-c` or `--current-results-salt` | The secret salt which is hashed along with the current results to produce the current result commitment input to the snark. |
| The current total voice credits salt | `-tvc` or `--current-total-vc-salt` | The secret salt which is hashed along with the current total number of spent voice credits to produce the current total voice credits commitment input to the snark. |
| The current per vote option voice credits salt | `-pvc` or `--current-per-vo-vc-salt` | The secret salt which is hashed along with the current total number of spent voice credits per vote option to produce the current total voice credits commitment input to the snark. |
| The final tally file | `-t` or `--tally-file` | A filepath in which to save the final vote tally and salt. |

### Anyone: Verify a vote tally

`node build/index.js verify <options>`

Fields to set:

| Option | Flags | About |
|-|-|-|
| The final tally file | `-t` or `--tally-file` | The final tally file created by the `tally` subcommand. |

## Demonstration

This section contains a sequence of commands which will be useful for a live
demonstration. They simulate the following scenario:

1. Alice votes for Party A
2. Alice changes her key
3. Eve tries to bribe Alice to change her vote to Party B
4. Alice submits an invalid vote for Party B
5. The coordinator processes the votes and computes the final tally
6. The expected result is: Party A has 1 vote and Party B has 0 votes. Alice’s
   invalid vote was not counted, and Eve had no way to tell.

**Coordinator: create keypair**

```
node ./build/index.js genMaciKeypair
```

Example output:

```
Private key: macisk.8715ab59a3e88a7ceec80f214ec24a95287ef2cb399a329b6964a87f85cf51c
Public key:  macipk.f2accdb00311dc1af2ec6e00505e6bf62dcc0614eac2276fa01846dc7bad840a

Please store your private key in a safe place and do not reveal it to anyone.
```

**Alice: create keypair**

```
node ./build/index.js genMaciKeypair
```

Example output:

```
Private key: macisk.53c8bc722a9f9d4c7bd478c8c8b01177f82d9c68d1ce15078e93ea84f198644
Public key:  macipk.a200c5991d633c0aefbe594de2d9cf8d1afbfbc935a1a39b0a7edc93b5a1abad

Please store your private key in a safe place and do not reveal it to anyone.
```

**Coordinator: create election**

```
node ./build/index.js create -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-sk macisk.8715ab59a3e88a7ceec80f214ec24a95287ef2cb399a329b6964a87f85cf51c \
	-e http://localhost:8545 \
	-s 15 \
	-o 60 \
	-bm 4 \
	-bv 4
```

Example output:

```
MACI: 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4
```

**Alice: sign up**

```
node ./build/index.js signup -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-p macipk.a200c5991d633c0aefbe594de2d9cf8d1afbfbc935a1a39b0a7edc93b5a1abad \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4
```

Example output:

```
Transaction hash: 0x3cd2e6e805b54a6dfaff840dcf496092447400a1b26ba9f3c31bd78c3fe15723
State index: 1
```

**Alice: vote for party A**

```
node ./build/index.js publish -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4 \
	-sk macisk.53c8bc722a9f9d4c7bd478c8c8b01177f82d9c68d1ce15078e93ea84f198644 \
	-p macipk.a200c5991d633c0aefbe594de2d9cf8d1afbfbc935a1a39b0a7edc93b5a1abad \
	-i 1 \
	-v 0 \
	-w 9 \
	-n 1
```

Example output:

```
Transaction hash: 0xc52ff70c3bbcc91457fd61738cd00d09d8bac96c56094910e275e474132ff741
Ephemeral private key: macisk.1e3233eec8d0ccf722f2576ba5cb1b361939f0617ac3583a3eb025e4944b0e40
```

**Alice: create new key**

```
node ./build/index.js genMaciKeypair
```

Example output:

```
Private key: macisk.ff3ae0e7855e4c62237e2b7c72de109865f087bd5f792cf4589d3cdc495d8f2
Public key:  macipk.90833965a98a890dc0ddb32f95cd077a32d235fc6222fe9fea8aad9fd17feaa9

Please store your private key in a safe place and do not reveal it to anyone.
```

**Alice: change key**

```
node ./build/index.js publish -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4 \
	-sk macisk.53c8bc722a9f9d4c7bd478c8c8b01177f82d9c68d1ce15078e93ea84f198644 \
	-p macipk.90833965a98a890dc0ddb32f95cd077a32d235fc6222fe9fea8aad9fd17feaa9 \
	-i 1 \
	-v 0 \
	-w 9 \
	-n 2
```

Example output:

```
Transaction hash: 0x812dc6345e2515bced4f15e7ca3842d3d343c22f6729fe3216b946fa97bffc1e
Ephemeral private key: macisk.24115d8d585b7dd8f7ea1975668b3d4f34dcf8b1bcc6617bdefbed7e41b89846
```

**Alice: vote for party B with old key**

```
node ./build/index.js publish -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4 \
	-sk macisk.53c8bc722a9f9d4c7bd478c8c8b01177f82d9c68d1ce15078e93ea84f198644 \
	-p macipk.a200c5991d633c0aefbe594de2d9cf8d1afbfbc935a1a39b0a7edc93b5a1abad \
	-i 1 \
	-v 1 \
	-w 9 \
	-n 3
```

Example output:

```
Transaction hash: 0x45ae379b056a6fc647a3718bd356268a1bcda35e6645bb7a1aba44cb76418c98
Ephemeral private key: macisk.2b23e978301d029e46117ef0138f860e277ffed0f008712f3d7ca2c40f1a6768
```

**Coordinator: process all messages** 
```
NODE_OPTIONS=--max-old-space-size=4096 node ./build/index.js process \
    -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4 \
	-sk macisk.8715ab59a3e88a7ceec80f214ec24a95287ef2cb399a329b6964a87f85cf51c \
	-r
```

Example output:

```
Processed batch starting at index 0
Transaction hash: 0xbd1bbe86cd4fc72f34911220db428751e8a483b3afcc9d30c1a15989a7b6a031
Random state leaf: <RANDOM STATE LEAF>
```

**Coordinator: tally all votes**

```
NODE_OPTIONS=--max-old-space-size=4096 node ./build/index.js tally \
    -d 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3 \
	-e http://localhost:8545 \
	-x 0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4 \
	-sk macisk.8715ab59a3e88a7ceec80f214ec24a95287ef2cb399a329b6964a87f85cf51c \
	-r \
	-c 0x0 \
	-tvc 0x0 \
	-pvc 0x0 \
	-t tally.json \
	-z <PASTE RANDOM STATE LEAF HERE>
```

Example output:

```
Transaction hash: 0x9ef0ab94d534650445c4ff748a43eacdedff1602929bd6a1bd568573374ddca2
Current results salt: 0xa54b75db545fcda278ce882cae90d069c6fcf81368778264550d9b66af05a42
Result commitment: 0x25deb6f675ed4f08742e1776eee130c627d168106fd813627963b241c1ba0754
```

The file `tally.json` will now contain something like the following:

```json
{
    "provider": "http://localhost:8545",
    "maci": "0x2C2B9C9a4a25e24B174f26114e8926a9f2128FE4",
    "results": {
        "commitment": "0x1cd0ec2789abceb908b06f6a74c26a848e209011ec41b3e5028bb7aeff2bdeb2",
        "tally": [
            "9",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0"
        ],
        "salt": "0x2d7f1744185507a529fdb32dec920bfdaf825b0fdba5b66661a40a71beac3b46"
    },
    "totalVoiceCredits": {
        "spent": "81",
        "commitment": "0x2d55a42ec1da99227125cf9562aa91aad12e2f1387ccf3411da79b0a953d69a6",
        "salt": "0xfc95a102f3c66d92d7a5700f1e12a6f2325c54a10efa0e1178cc21b67f0d97c"
    },
    "totalVoiceCreditsPerVoteOption": {
        "commitment": "0x18526f481cf2476543c8dcc3762f3a54af8e217d3d048810856623367ef4ba14",
        "tally": [
            "81",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0"
        ],
        "salt": "0x1f17d2ff16b9791ef4b1849bfccf420b9fece161e419ad4f8b1ef726c62e3943"
    }
}
```

Anyone can now run `verify` to check if the tally is correct:

```bash
node build/index.js verify -t tally.json
```

Example output:

```
The results commitment in the specified file is correct given the tally and salt
The total spent voice credit commitment in the specified file is correct given the tally and salt
The per vote option spent voice credit commitment in the specified file is correct given the tally and salt
The results commitment in the MACI contract on-chain is valid
The total spent voice credit commitment in the MACI contract on-chain is valid
The per vote option spent voice credit commitment in the MACI contract on-chain is valid
```
