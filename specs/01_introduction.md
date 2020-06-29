# Minimum Anti-Collusion Infrastructure

*Barry WhiteHat, Kendrick Tan, Kobi Gurkan, Chih-Cheng Liang, and Koh Wei Jie*

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Introduction](#introduction)
- [High-level process](#high-level-process)
- [Technical process](#technical-process)
- [Availability and visibility of messages](#availability-and-visibility-of-messages)
- [System components](#system-components)
  - [Roles](#roles)
  - [Cryptographic operations](#cryptographic-operations)
    - [Key generation](#key-generation)
    - [Command signing and encryption](#command-signing-and-encryption)
- [Glossary](#glossary)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction

This specification is for an implementation of Minimum Anti-Collusion Infrastructure (MACI). Originally proposed by Vitalik Buterin in [this ethresear.ch post](https://ethresear.ch/t/minimal-anti-collusion-infrastructure/5413), systems built with MACI make collusion among participants difficult, while retaining the censorship resistance and correct-execution benefits of smart contracts. Although MACI can provide collusion resistance only if the coordinator is honest, a dishonest coordinator can neither censor nor tamper with its execution. 

Note that MACI presumes an identity system where each legitimate member controls a unique Ethereum private key.

## High-level process

Whitelisted voters named Alice, Bob, and Charlie register to vote by sending their public key to a smart contract. Additionally, there is a central coordinator Dave, whose public key is known to all.

A later version of MACI will have to mitigate a [vote-buying attack](https://ethresear.ch/t/minimal-anti-collusion-infrastructure/5413/3) where a user may be bribed immediately when the voting period starts, such that their very first message is influenced by a briber. One solution to this is to have the contract to mandate that the first message that each participant sends is to change their key (see below). For the sake of simplicity, however, this specification will not address this issue. 

When Alice casts her vote, she signs her vote with her private key, encrypts her signature with Dave's public key, and submits the result to the smart contract.

Each voter may change her keypair at any time. To do this, she creates and signs a key-change command, encrypts it, and sends it to the smart contract. This makes it impossible for a briber to ever be sure that their bribe has any effect on the bribee's vote.

If Bob, for instance, bribes Alice to vote a certain way, she can simply use the first public key she had registered ⁠— which is now void ⁠— to cast a vote. Since said vote is encrypted, as was the key-changing message which Alice had previously sent to Dave, Bob has no way to tell if Alice had indeed voted the way he wanted her to.

Even if Alice reveals the cleartext of her vote to Bob, she just needs to not show him the updated key command that she previously used to invalidate that key. In short, as long as she had submitted a single encrypted command before her vote, there is no way to tell if said vote is valid or not.

## Technical process

Refer to the [Glossary](#Glossary) for defintions of terms.

1. The coordinator deploys the MACI contract to an Ethereum blockchain and starts the sign-up period. The same transaction that deploys the contract also stores the value of an empty vote option tree.
2. To sign up, each user creates an EdDSA keypair and invokes the contract's `signUp()` function. Alternatively, there is a mechanism where some contract function checks if the user owns a particular ERC721 token and adds them to the whitelist. It in turn generates a new leaf to the state tree and updates the state tree root.

<!--Additionally, the user must pay a deposit, which discourages them from sharing their EdDSA private key with a potential briber. The user may redeem this deposit anytime after the voting period starts.-->

3. The signup period ends after a fixed amount of time. From that point onwards, users may no longer invoke `signUp()` in this contract.

4. Each user votes. To do this, they:

    -  Sign their command using the key which they had signed up with and then use a random (ephemeral) key as well as the coordinator's public key to generate a shared key (via ECDH) encrypt it.

        -  If they are bribed, the user should sign it using an old public key which has already been replaced with a new one.

        -  Otherwise, the user should use the most current public key they have registered.

    -  Submit the the message, as well as the epheremal public key in the clear to the contract using its `publishMessage()` function, which hashes the command and inserts it into the message tree.

5. The coordinator processes all the commands after the voting period ends.

6. For each batch of commands, they perform the following steps:
    
    - Generate a new state root which is the result of:

        - For each valid command, update the state leaf accordingly

        - Ignore all invalid commands

        - Update leaf 0 with a random leaf

    - Generate a zk-SNARK proof that this state root transition is valid. (Note that "state root" refers to the root of the state tree in the contract, not the Ethereum state root as defined in the Yellow Paper.)

    - An invalid message can one which is signed by a public key which a user had already replaced with another key, among other criteria. To allow a bribee to plausibly claim that they have voted correctly even if they use an old public key, we insert a random leaf at index `0` whether or not the message is valid.

![](https://i.imgur.com/kNQR9ks.png)

*Figure 1: The relationship between each users, the coordinator, the contract functions, as well as the state tree and the message tree.*

7. When the voting period ends, the coordinator tallies all the votes. It then generates zk-SNARK proof that the computed result is valid without revealing the plaintext of the votes. While this specification specifically describes a quadratic voting use case, the circuit used to generate this proof should differ based on the particular nature of the voting system.

## Availability and visibility of messages

The coordinator may decrypt all commands.

Each participant may only decrypt their own messages, and should not be able to decrypt other users' messages or access their commands.

No-one else should be able to decrypt any messages.

## System components

### Roles

There are two roles: users and a coordinator.

### Cryptographic operations

#### Key generation

Each user owns an EdDSA keypair, as does the coordinator. Every user should have a copy of the coordinator's public key, which is stored and available from the smart contract. Likewise, the coordinator should have a copy of each user's public key, which they publish on-chain to sign up.

We define an EdDSA private key as a random value (initially 256 bits large) modulo the snark field size as described in [EIP197](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-197.md). This results in a key size of roughly 253 bits and no more than 254 bits. Additionally, we use [this efficient algorithm](http://cvsweb.openbsd.org/cgi-bin/cvsweb/~checkout~/src/lib/libc/crypt/arc4random_uniform.c) to prevent modulo bias.

#### Command signing and encryption

The following steps are needed to sign and encrypt a message:

1. Hash the command
2. Sign the hash with the user's EdDSA private key
3. Generate an ECDH shared key using a random private key (the ephemeral key) and the coordinator's public key.
4. Encrypt both the signature and the data included in the command with the shared key
5. Note that when we call `publishMessage`, we pass in the encrypted data, the signing public key, and random public key.

## Glossary

Some terms in this specification are similar to one another but should not be used interchangably. This glossary should help to resolve such ambiguities.

| Term | Meaning |
|-|-|
| Command | Unencrypted data whose fields include the user's public key, vote etc. |
| Message | An encrypted command and signature (`Encrypt([Command, Signature], Key)`. |
| State | The mapping between each user's public key and the full set of information about which options they voted for and the weight per vote. Note that this does not refer to the Ethereum state as defined in the Yellow Paper. |
| Vote | The options which the user voted for |
| Vote option | One out of many possible choices which a user may vote for |
| Vote option tree | The unique tree of weights that each user assigns to vote options. This represents the full set of information about which options a user had voted for and how many voice credits they had spent per vote.  |
| Voice credit | One unit which denotes the strength of a user's vote for a particular option. In a quadratic voting use case, users start out with a limited number of voice credits and spend them on votes. |
