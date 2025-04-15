[![Lint](https://github.com/Balmy-Protocol/oracles/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/Balmy-Protocol/oracles/actions/workflows/lint.yml)
[![Tests](https://github.com/Balmy-Protocol/oracles/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Balmy-Protocol/oracles/actions/workflows/tests.yml)
[![Slither Analysis](https://github.com/Balmy-Protocol/oracles/actions/workflows/slither.yml/badge.svg?branch=main)](https://github.com/Balmy-Protocol/oracles/actions/workflows/slither.yml)

# Balmy Oracles

This repository will hold all Balmy's oracle infrastructure. It aims to have a sufficiently flexible architecture as to support a wide amount of tokens composition, and therefore enabling quoting pairs that couldn't be done before.

Some of this is achieved by leveraging already existing oracles like [Uniswap V3 Static Oracle](https://github.com/Balmy-Protocol/uniswap-v3-oracle).

## 🔒 Audits

Oracles has been audited by [Omniscia](https://omniscia.io/) and can be find [here](https://omniscia.io/reports/mean-finance-oracle-module/).

## 📦 NPM/YARN Package

The package will contain:

- Artifacts can be found under `@balmy/oracles/artifacts`
- Typescript smart contract typings under `@balmy/oracles/typechained`

## 📚 Documentation

Everything that you need to know as a developer on how to use all repository smart contracts can be found in the [documented interfaces](./solidity/interfaces/).

## 🛠 Installation

To install with [**Hardhat**](https://github.com/nomiclabs/hardhat) or [**Truffle**](https://github.com/trufflesuite/truffle):

#### YARN

```sh
yarn add @balmy/oracles
```

### NPM

```sh
npm install @balmy/oracles
```

## 📖 Deployment Registry

Contracts are deployed at the same address on all available networks via the [deterministic contract factory](https://github.com/Balmy-Protocol/deterministic-factory)

> Available networks: Optimism, Arbitrum One, Polygon.

- Identity Oracle: `0x0171C3D8315159d771f4A4e09840b1747b7f7364`
- OracleAggregator: `0x9e1ca4Cd00ED059C5d34204DCe622549583545d9`
- StatefulChainlinkOracle: `0x5587d300d41E418B3F4DC7c273351748a116d78B`
- UniswapV3Adapter: `0xD741623299413d02256aAC2101f8B30873fED1d2`
- TransformerOracle: `0xEB8615cF5bf0f851aEFa894307aAe2b595628148`
