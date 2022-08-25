import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import moment from 'moment';
import { BigNumber, BigNumberish } from 'ethers';
import { bytecode } from '../artifacts/solidity/contracts/StatefulChainlinkOracle.sol/StatefulChainlinkOracle.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();
  const registry = await hre.deployments.get('ChainlinkFeedRegistry');

  let maxDelay: BigNumberish;

  switch (hre.deployments.getNetworkName()) {
    case 'ethereum':
    case 'optimism':
    case 'polygon':
    case 'arbitrum':
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'optimism-kovan':
    case 'polygon-mumbai':
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
      types: ['address', 'uint32', 'address', 'address[]'],
      values: [registry.address, maxDelay, msig, [msig]],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 3_000_000,
        },
  });
};

deployFunction.tags = ['StatefulChainlinkOracle'];
deployFunction.dependencies = ['ChainlinkFeedRegistry'];
export default deployFunction;
