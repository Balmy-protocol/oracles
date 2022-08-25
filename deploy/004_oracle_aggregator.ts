import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/OracleAggregator.sol/OracleAggregator.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const identityOracle = await hre.deployments.get('IdentityOracle');
  const chainlinOracle = await hre.deployments.get('StatefulChainlinkOracle');
  const uniswapAdapter = await hre.deployments.get('UniswapV3Adapter');
  const oracles = [identityOracle.address, chainlinOracle.address, uniswapAdapter.address];

  await deployThroughDeterministicFactory({
    deployer,
    name: 'OracleAggregator',
    salt: 'MF-Oracle-Aggregator-V2',
    contract: 'solidity/contracts/OracleAggregator.sol:OracleAggregator',
    bytecode,
    constructorArgs: {
      types: ['address[]', 'address', 'address[]'],
      values: [oracles, msig, [msig]],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 3_000_000,
        },
  });
};

deployFunction.dependencies = ['StatefulChainlinkOracle', 'UniswapV3Adapter', 'IdentityOracle'];
deployFunction.tags = ['OracleAggregator'];
export default deployFunction;
