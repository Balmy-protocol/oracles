import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/adapters/LegacyPriceOracleAdapter.sol/LegacyPriceOracleAdapter.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'LegacyAdapterOracle',
    salt: 'MF-Legacy-Oracle-V2',
    contract: 'solidity/contracts/adapters/LegacyPriceOracleAdapter.sol:LegacyPriceOracleAdapter',
    bytecode,
    constructorArgs: {
      types: ['address'],
      values: ['0x9e1ca4Cd00ED059C5d34204DCe622549583545d9'],
    },
    log: true,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 15_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['LegacyAdapterOracle'];
export default deployFunction;
