import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId } from '../utils/deploy';
import { UniswapV3Adapter__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';
import moment from 'moment';
import { getAdminAddress } from './utils';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = await getChainId(hre);
  const superAdmin = getAdminAddress(chainId);

  const minimumPeriod = moment.duration('5', 'minutes').as('seconds');
  const maximumPeriod = moment.duration('45', 'minutes').as('seconds');
  let period: number;

  switch (chainId) {
    case 10: // Optimism
    case 137: // Polygon
      period = moment.duration('10', 'minutes').as('seconds');
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  const config = {
    uniswapV3Oracle: '0xB210CE856631EeEB767eFa666EC7C1C57738d438',
    maxPeriod: maximumPeriod,
    minPeriod: minimumPeriod,
    initialPeriod: period,
    superAdmin,
    initialAdmins: [],
  };

  await deployThroughDeterministicFactory({
    deployer,
    name: 'UniswapV3Adapter',
    salt: 'MF-Uniswap-V3-Adapter-V1',
    contract: 'solidity/contracts/adapters/UniswapV3Adapter.sol:UniswapV3Adapter',
    bytecode: UniswapV3Adapter__factory.bytecode,
    constructorArgs: {
      types: [
        'tuple(address uniswapV3Oracle,uint16 maxPeriod,uint16 minPeriod,uint16 initialPeriod,address superAdmin,address[] initialAdmins)',
      ],
      values: [config],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 3_000_000,
    },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['UniswapV3Adapter'];
export default deployFunction;
