import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/adapters/api3-chainlink-adapter/API3ChainlinkAdapterFactory.sol/API3ChainlinkAdapterFactory.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'API3ChainlinkAdapterFactory',
    salt: 'MF-Transformer-Oracle-V2',
    contract: 'solidity/contracts/adapters/api3-chainlink-adapter/API3ChainlinkAdapterFactory.sol:API3ChainlinkAdapterFactory',
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
deployFunction.tags = ['API3ChainlinkAdapterFactory'];
export default deployFunction;
