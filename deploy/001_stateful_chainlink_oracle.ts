import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import moment from 'moment';
import { BigNumber, BigNumberish } from 'ethers';
import { bytecode } from '../artifacts/solidity/contracts/StatefulChainlinkOracle.sol/StatefulChainlinkOracle.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();
  const registry = await hre.deployments.get('ChainlinkFeedRegistry');

  let weth: string;
  let maxDelay: BigNumberish;

  switch (hre.deployments.getNetworkName()) {
    case 'ethereum':
      weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'optimism':
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'optimism-kovan':
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'arbitrum':
      weth = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'polygon':
      weth = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'polygon-mumbai':
      weth = '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  await deployThroughDeterministicFactory({
    deployer,
    name: 'StatefulChainlinkOracle',
    salt: 'MF-StatefulChainlink-Oracle-V1',
    contract: 'solidity/contracts/StatefulChainlinkOracle.sol:StatefulChainlinkOracle',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'uint32', 'address', 'address[]'],
      values: [weth, registry.address, maxDelay, msig, [msig]],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 3_000_000,
    },
  });
};

deployFunction.tags = ['StatefulChainlinkOracle'];
export default deployFunction;
