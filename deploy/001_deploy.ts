import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { StatefulChainlinkOracleAdapter__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';

const CHAINLINK_ORACLE = '0x86E8cB7Cd38F7dE6Ef7fb62A5D7cCEe350C40310';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'StatefulChainlinkOracleAdapter',
    salt: 'MF-StatefulChainlink-Adapter-V1',
    contract: 'solidity/contracts/adapters/StatefulChainlinkOracleAdapter.sol:StatefulChainlinkOracleAdapter',
    bytecode: StatefulChainlinkOracleAdapter__factory.bytecode,
    constructorArgs: {
      types: ['address'],
      values: [CHAINLINK_ORACLE],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 3_000_000,
    },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['StatefulChainlinkOracleAdapter'];
export default deployFunction;
