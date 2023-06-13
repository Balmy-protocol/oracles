import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/solidity/contracts/StatefulChainlinkOracle.sol/StatefulChainlinkOracle.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { getNamedAccounts } from './utils';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await getNamedAccounts(hre);
  const registry = await hre.deployments.get('ChainlinkFeedRegistry');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'StatefulChainlinkOracle',
    salt: 'MF-StatefulChainlink-Oracle-V2',
    contract: 'solidity/contracts/StatefulChainlinkOracle.sol:StatefulChainlinkOracle',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address[]'],
      values: [registry.address, msig, [msig]],
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
