import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/adapters/dia-chainlink-adapter/DIAChainlinkAdapterFactory.sol/DIAChainlinkAdapterFactory.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'DIAChainlinkAdapterFactory',
    salt: 'MF-DIA-Adapter-Factory-V2',
    contract: 'solidity/contracts/adapters/dia-chainlink-adapter/DIAChainlinkAdapterFactory.sol:DIAChainlinkAdapterFactory',
    bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 15_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['DIAChainlinkAdapterFactory'];
export default deployFunction;
