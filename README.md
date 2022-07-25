[![Lint](https://github.com/Mean-Finance/oracles/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/Mean-Finance/oracles/actions/workflows/lint.yml)
[![Tests](https://github.com/Mean-Finance/oracles/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Mean-Finance/oracles/actions/workflows/tests.yml)
[![Slither Analysis](https://github.com/Mean-Finance/oracles/actions/workflows/slither.yml/badge.svg?branch=main)](https://github.com/Mean-Finance/oracles/actions/workflows/slither.yml)

# Mean Finance Oracles

This repository will hold all Mean Finance's oracle infrastructure. It aims to have a sufficiently flexible architecture as to support a wide amount of tokens composition, and therefore enabling quoting pairs that couldn't be done before.

Some of this is achieved by leveraging already existing oracles like [Uniswap V3 Static Oracle](https://github.com/Mean-Finance/uniswap-v3-oracle).

## Package

The package will contain:

- Artifacts can be found under `@mean-finance/oracles/artifacts`
- Compatible deployments for [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) plugin under the `@mean-finance/oracles/deployments` folder.
- Typescript smart contract typings under `@mean-finance/oracles/typechained`

## Documentation

Everything that you need to know as a developer on how to use all repository smart contracts can be found in the [documented interfaces](./solidity/interfaces/).

## Installation

To install with [**Hardhat**](https://github.com/nomiclabs/hardhat) or [**Truffle**](https://github.com/trufflesuite/truffle):

#### YARN

```sh
yarn install @mean-finance/oracles
```

### NPM

```sh
npm install @mean-finance/oracles
```

### Deployment Registry

Contracts are deployed at the same address on all available networks via the [deterministic contract factory](https://github.com/Mean-Finance/deterministic-factory)

> Available networks: Optimism, Optimism Kovan, Arbitrum Rinkeby, Polygon, Mumbai (Polygon testnet).

- OracleAggregator: `0xFD8aD08F7e35FA949c6dEB9B58623345Faa5D3EF`
- StatefulChainlinkOracleAdapter: `0x4708433c4EF50544e7a37e2903c434F293A21aaC`
- UniswapV3Adapter: `0xdd18E04096c5E974B23d6205e2138EDA139848D3`
