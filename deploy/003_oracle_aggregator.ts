import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId } from '../utils/deploy';
import { OracleAggregator__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, admin: superAdmin } = await hre.getNamedAccounts();

  const chainlinkAdapter = await hre.deployments.get('StatefulChainlinkOracleAdapter');
  const uniswapAdapter = await hre.deployments.get('UniswapV3Adapter');
  const oracles = [chainlinkAdapter.address, uniswapAdapter.address];

  await deployThroughDeterministicFactory({
    deployer,
    name: 'OracleAggregator',
    salt: 'MF-Oracle-Aggregator-V2',
    contract: 'solidity/contracts/OracleAggregator.sol:OracleAggregator',
    bytecode: OracleAggregator__factory.bytecode,
    constructorArgs: {
      types: ['address[]', 'address', 'address[]'],
      values: [oracles, superAdmin, [superAdmin]],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 3_000_000,
    },
  });
};

deployFunction.dependencies = ['StatefulChainlinkOracleAdapter', 'UniswapV3Adapter'];
deployFunction.tags = ['OracleAggregator'];
export default deployFunction;
