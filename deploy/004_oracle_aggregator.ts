import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { OracleAggregator__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor: superAdmin } = await hre.getNamedAccounts();

  const identityOracle = await hre.deployments.get('IdentityOracle');
  const chainlinOracle = await hre.deployments.get('StatefulChainlinkOracle');
  const uniswapAdapter = await hre.deployments.get('UniswapV3Adapter');
  const oracles = [identityOracle.address, chainlinOracle.address, uniswapAdapter.address];

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

deployFunction.dependencies = ['StatefulChainlinkOracle', 'UniswapV3Adapter', 'IdentityOracle'];
deployFunction.tags = ['OracleAggregator'];
export default deployFunction;
