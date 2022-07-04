import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId } from '../utils/deploy';
import { UniswapV3Adapter__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, admin: superAdmin } = await hre.getNamedAccounts();
  const chainId = await getChainId(hre);

  const minimumPeriod = moment.duration('5', 'minutes').as('seconds');
  const maximumPeriod = moment.duration('45', 'minutes').as('seconds');
  let period: number;

  switch (chainId) {
    case 10: // Optimism
    case 69: // Optimism Kovan
    case 42161: // Arbitrum
    case 421611: // Arbitrum Rinkeby
    case 137: // Polygon
    case 80001: // Polygon Mumbai
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
    initialAdmins: [superAdmin],
  };

  await deployThroughDeterministicFactory({
    deployer,
    name: 'UniswapV3Adapter',
    salt: 'MF-Uniswap-V3-Adapter-V2',
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
