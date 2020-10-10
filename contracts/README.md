# `maci-contracts`

This submodule contains all the Ethereum contracts and tests for MACI.

## Contracts

**`MACI.sol`**

The main contract to which all on-chain interactions should occur.

It should not contain much code besides its constructor function. Rather, it
should inherit from the following contracts, each of which defines a specific
class of functions:

* **`Polls.sol`**

    - Defines all contract storage variables and constants. All data pertaining
      to a poll resides here.

* **`DomainObjs.sol`**

    - Defines `struct`s that represent domain objects.

* **`External.sol`**

    - Defines functions that interact with external contracts (i.e. sign-up
      gatekeepers and voice credit oracles).

* **`VoterInteractions.sol`**

    - Defines functions for voters (i.e. sign up and publish messages).

* **`CoordinatorInteractions.sol`**

    - Defines functions for coordinators (i.e. process and tally votes).

* **`Getters.sol`**

    - Defines convenience view functions, particularly those which are more
      complex than reading a single variable.

**`crypto/`**

Contracts with cryptographic functions including hash functions.

**`trees/`**

Merkle tree contracts.

**`verifiers/`**

zk-SNARK verifier contracts.

**`tally/`**

Contracts with convenience functions for tally verification.

**`testing/`**

Contracts with testing and gas benchmark functions only for development purposes.
