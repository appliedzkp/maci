# Minimal Anti-Collusion Infrastructure

Please refer to the [implementation spec](./specs/) for technical details, and
the original [ethresear.ch
post](https://ethresear.ch/t/minimal-anti-collusion-infrastructure/5413) for a
high-level view.

We welcome contributions to this project. Please join our
[Telegram group](https://t.me/joinchat/LUgOpE7J2gstRcZqdERyvw) to discuss.

## Local development and testing

### Requirements

You should have Node 11.14.0 installed. Use
[`nvm`](https://github.com/nvm-sh/nvm) to install it.

### Get started

Clone this repository, install NodeJS dependencies, and build the source code:

```bash
git clone git@github.com:appliedzkp/maci.git && \
npm i && \
npm run bootstrap && \
npm run build
```

Next, install Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Also install [`zkutil`](https://github.com/poma/zkutil) v0.2.1 and ensure that
the `zkutil` binary is in the `~/.cargo/bin/` directory. You can [configure](https://lorenwest.github.io/node-config/) the
path to this binary via `maci-config` (see `config/test.yaml` for an example).

```bash
cargo install zkutil --version 0.2.1 &&
zkutil --help
```

Next, perform a trusted setup.

For development purposes, you can generate the proving and verifying keys for
the zk-SNARK circuits, along with their Solidity verifier contracts as such:

```bash
cd circuits
npm run buildBatchUpdateStateTreeSnark
npm run buildQuadVoteTallySnark
```

This should take no more than 3 minutes as we use `zkutil` under the hood.
We used to provide download links to working versions of the keys and
compiiled circuit files, but now that we can use `zkutil` to produce them
very quickly, we no longer maintain them.

Note that if you change the circuits and recompile them, you should
also update and recompile the verifier contracts in `contracts/sol`
with their new versions, or the tests will fail:

```bash
cd contracts
npm run compileSol
```

### Demo

You can use the MACI command-line interface to run a demo. See: https://github.com/appliedzkp/maci/tree/master/cli#demonstration

### Local development

This repository is organised as Lerna submodules. Each submodule contains its
own unit tests.

- `config`: project-wide configuration files. Includes config files for both
  testing and production.
- `crypto`: low-level cryptographic operations.
- `circuits`: zk-SNARK circuits.
- `contracts`: Solidity contracts and deployment code.
- `domainobjs`: Classes which represent high-level [domain
  objects](https://wiki.c2.com/?DomainObject) particular to this project.
- `core`: Business logic functions for message processing, vote tallying,
  and circuit input generation through `MaciState`, a state machine
  abstraction.
- `cli`: A command-line interface with which one can deploy and interact with
  an instance of MACI.
- `integrationTests`: Integration tests which use the command-line interface
  to perform end-to-end tests.

### Testing

#### Unit tests

The following submodules contain unit tests: `core`, `crypto`, `circuits`,
`contracts`, and `domainobjs`.

Except for the `contracts` submodule, run unit tests as such (the following
example is for `crypto`):

```bash
cd crypto
npm run test
```

For `contracts` and `integrationTests`, run the tests one by one. This prevents
incorrect nonce errors.

First, start a Ganache instance in a separate terminal:

```bash
cd contracts
npm run ganache
```

In another terminal, run the tests individually:

```bash
cd contracts
./scripts/runTestsInCircleCi.sh
```

or

```bash
cd integrationTests
./scripts/runTestsInCircleCi.sh
```

You can ignore the Ganache errors which this script emits as you should already
have Ganache running in a separate terminal. Otherwise, you will have to exit
Ganache using the `kill` command.
