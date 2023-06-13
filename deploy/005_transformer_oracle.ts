import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/TransformerOracle.sol/TransformerOracle.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';
import { getNamedAccounts } from './utils';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await getNamedAccounts(hre);

  const transformerRegistry = await hre.deployments.get('TransformerRegistry');
  const aggregator = await hre.deployments.get('OracleAggregator');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'TransformerOracle',
    salt: 'MF-Transformer-Oracle-V2',
    contract: 'solidity/contracts/TransformerOracle.sol:TransformerOracle',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address', 'address[]'],
      values: [transformerRegistry.address, aggregator.address, msig, [msig]],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 3_000_000,
        },
  });
};

deployFunction.dependencies = ['OracleAggregator', 'TransformerRegistry'];
deployFunction.tags = ['TransformerOracle'];
export default deployFunction;
