# Contract

There is an Ethereum contract (`MACI`) which provides the following interface:

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Merkle trees in storage](#merkle-trees-in-storage)
- [`signUp(PubKey _pubKey) payable`](#signuppubkey-_pubkey-payable)
- [`publishMessage(uint256 _msg, PubKey _encPubKey)`](#publishmessageuint256-_msg-pubkey-_encpubkey)
- [`batchProcessMessage(...)`](#batchprocessmessage)
- [`proveVoteTallyBatch()`](#provevotetallybatch)
- [State leaves](#state-leaves)
  - [Schema](#schema)
- [Commands](#commands)
  - [Schema](#schema-1)
  - [About nonces](#about-nonces)
- [Message verification](#message-verification)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Merkle trees in storage

We maintain two Merkle roots in the MACI contract:

| Tree root | Represents |
|-|-|
| `messageTree` | Messages ⁠— both valid and invalid ⁠— submitted by users. |
| `stateTree` | The current mapping between public keys and votes. Leaf 0 is reserved for a random value. |

The zero value (for empty leaves) for each tree is a nothing-up-my-sleeve value: the Keccack256 hash of the string 'Maci':

```solidity
uint256 SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
uint ZERO_VALUE = uint256(keccak256(abi.encodePacked('Maci'))) % SNARK_SCALAR_FIELD;
```

which is equal to:

```
5503045433092194285660061905880311622788666850989422096966288514930349325741
```

## Vote option trees

We use a Quinary Merkle tree (5 leaves per node) to store votes.

## `signUp(PubKey _userPubKey, bytes memory _signUpGatekeeperData, bytes memory _initialVoiceCreditProxyData)`

Signups can only occur during the signup period. The `signUp` function passes the sender's address, along with the `_signUpGatekeeperData` to a `SignUpGateway` contract, which determines whether or not to allow the user to sign up. For instance, this contract can be a simple whitelist.

The `signUp` function also passes `_initialVoiceCreditProxyData` to an `InitialVoiceCreditProxy` contract which determines how many voice credits the user should have initially. This can be a constant value for all users, or a different credits per user.

Next, it adds a new leaf to the state tree, starting from index `1` (as index 0 is reserved for invalid leaves). This leaf is the hash of the public key, the user's voice credits, the nonce `0`, and the root of an empty vote option tree.

The sign-up period ends after a predefined deadline. A later version of MACI will allow ongoing sign-ups where state trees will be merged once per week.

## `publishMessage(uint256 _msg, PubKey _encPubKey)`

This function ensures that the current block time is past the signup period, increments the message counter, and then updates the message root.

This function must be public and anyone should be able to call it.

## `batchProcessMessage(...)`

The parameters are:

```
uint256 _newStateRoot,
uint256[] memory _stateTreeRoots,
PubKey[] memory _ecdhPubKeys,
uint256[8] memory _proof
```

This function accepts a batch update state root transition zk-SNARK proof (`_proof`) and public inputs to the zk-SNARK.

It verifies the proof, updates the processed message counter, and updates the state root in storage with `newStateRoot`. 

If the proof is valid, this means that the coordinator has correctly updated the state tree root according to the commands in the given batch of messages.

It also increments the message tree index by the number of commands whose processing is verified by the given zk-SNARK proof.

This function should, however, only do so if the processed message counter indicates that all previous messages have already been processed.

Although anyone may call this contract function, only the coordinator should know the ECDH shared keys used to encrypt the messages.

## `proveVoteTallyBatch()`

The parameters are:

```
uint256 _intermediateStateRoot,
uint256 _newResultsCommitment,
uint256[] memory _finalSaltedResults,
uint256[8] memory _proof
```

This allows the coordinator to prove the correctness of their vote tally (in `_finalSaltedResults`). They do this in batches of state leaves. Each batch of state leaves is accumulated into an intermediate state root, and the Merkle root of all the intermediate state roots is the full state root. The proof shows that the result of adding the votes in the current batch to the culmulative results is computed correctly, but hides the results by salting and hashing them.

`_finalSaltedResults` can be any value but for the final batch, it must be the correct quadratic vote tally.

It does not matter that the contract does or does not restrict access to this function as anyone who can produce a valid proof should be able to tally the votes, and it should not be possible for anyone to tamper with the results anyway.

## State leaves

Each state leaf contains a user's public key, the Merkle root of their unique vote option tree, the number of voice credits they have left, and the nonce.

The nonce is either 0 or that of their most recent valid command. For instance, a user who has published 0 valid commands has a nonce of `0`, and their first valid command should have the nonce `1`.

Each user's public key is associated with exactly one state leaf. This leaf is the single source of truth of their vote option tree. Additionally, since a user may vote for multiple options, and allocate different amounts of voice credits to each option, we represent their votes as a Merkle tree.

### Schema

| Data | Bits | Comments |
|-|-|-|
| `publicKeyX` | 253 | The public key's x-coordinate. |
| `publicKeyY` | 253 |  The public key's y-coordinate. |
| `voteOptionTreeRoot` | 253 | The Merkle root of the tree which represents the options which this particular user voted for. |
| `voiceCreditBalance` | 32 | The number of remaining voice credits that the user can spend. |
| `nonce` | 32 | The nonce of the most recently inserted command for this user.

The schema for leaves of the vote option tree, which we dub *vote leaves*, is as such:

| Data | Bits | Comments |
|-|-|-|
| `votes` | 32 | In the quadratic voting use case, this is the square root of the voice credits spent for this option. |

## Commands

Each command may convey a key-change request, a vote, or both. There is only one schema for all commands.

### Schema

Be careful not to confuse the following leaf schema for commands with the state leaf schema. Each user may submit multiple commands, but should only be associated with one state leaf.

| Data | Bits | Comments |
|-|-|-|
| `stateIndex`| State tree depth | The index of the leaf in the state tree which contains the public key used to sign the message. This is used to point to the state leaf to update. |
| `encPublicKeyX` | 253  | The x-coordinate of the ephemeral public key. Its associated private key is used to encrypt the message. |
| `encPublicKeyY` | 253  | The y-coordinate of the ephemeral public key. (We may use 1 bit, depending on the implementation) |
| `newPublicKeyX` | 253  | The new public key's x-coordinate. If no change is required, it should be that of the current key. |
| `newPublicKeyY` | 253  | The new public key's y-coordinate. If no change is required, it should be that of the current key. (We may use 1 bit, depending on the implementation) |
| `voteOptionIndex` | Vote option tree depth | The index of the leaf in the vote option tree to which this state leaf refers. |
| `newVoteWeight` | 32 | In the quadratic voting use case, this is the square root of the number of voice credits a user wishes to spend on this vote. |
| `nonce` | 32 | Prevents replay attacks. Starts from `0` and for each message. A message meant to fool a briber may contain *any nonce necessary* to do so. For more details, see the section on nonces below. |

A useful rule of thumb is that the coordinator -- not the user --  should provide information that they know if they possess it. As such, the command does not contain information such as the Merkle path to the root of the vote option tree, since the coordinator should have it.

### About nonces

The first valid message that a user submits should have a nonce of `1`. The nonce of subsequent messages now depends on whether the user is bribed and has to reveal their vote to the briber.

In the case that a user is not bribed, nonces are simply incremental.

If a user is bribed against their will, however, they should set the nonce to whatever is necessary to fool the briber. For instance, a user with EdDSA key `Kb` who had previously submitted this message:

`{key = Kb, vote = A, nonce = 1}`

could encrypt and submit this invalid message:

`{key = Ka, vote = B, nonce = 1}`

where `Ka` is an invalid key. When the user decrypts this message and reveals it to the briber, the briber not only has no way to tell if this message is valid, they also have no reason to think that the user had not previously submitted valid messages, as the nonce is `1`.

## Message verification

Given a `command` from a user Alice, we say that the state transition from an `oldStateRoot` to a `newStateRoot` is *valid* if and only if (not in order of processing):

1. The nonce equals the total number of valid commands from Alice processed by the coordinator in order to produce `oldStateRoot`, minus one. See the section on nonces.
2. The decrypted message is signed by Alice's current EdDSA private key.
3. The signature is valid. <!--This includes edge cases such as whether the points of the signature (like `R8`) are valid points.-->
<!--4. The command has the correct length.-->
<!--5. Each command field has the correct length.-->
6. The specified vote option is indeed a choice that the user may make in the system.
7. The user has enough voice credits left.
8. Inserting the newly produced state leaf into the current state tree with `oldStateRoot` results in a new state tree with a root equal to `newStateRoot`.
9. The state leaf index is less or equal to than the maximum state leaf index (2 ** state tree depth) and is not equal to 0.
