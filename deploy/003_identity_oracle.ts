import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { IdentityOracle__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'IdentityOracle',
    salt: 'MF-Identity-Oracle-V1',
    contract: 'solidity/contracts/IdentityOracle.sol:IdentityOracle',
    bytecode: IdentityOracle__factory.bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 3_000_000,
    },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['IdentityOracle'];
export default deployFunction;
