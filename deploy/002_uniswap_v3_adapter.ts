import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { bytecode } from '../artifacts/solidity/contracts/adapters/UniswapV3Adapter.sol/UniswapV3Adapter.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { DeployFunction } from '@0xged/hardhat-deploy/dist/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const supportedNetworks = [
    'ethereum-rinkeby',
    'ethereum-kovan',
    'ethereum-goerli',
    'ethereum',
    'optimism',
    'optimism-kovan',
    'optimism-goerli',
    'arbitrum',
    'arbitrum-rinkeby',
    'polygon',
    'polygon-mumbai',
    'bnb',
    'bnb-testnet',
  ];

  if (!supportedNetworks.includes(hre.deployments.getNetworkName().toLowerCase())) {
    return;
  }

  const { deployer, msig } = await hre.getNamedAccounts();

  const minimumPeriod = moment.duration('5', 'minutes').as('seconds');
  const maximumPeriod = moment.duration('45', 'minutes').as('seconds');
  const period = moment.duration('10', 'minutes').as('seconds');

  const config = {
    uniswapV3Oracle: '0xB210CE856631EeEB767eFa666EC7C1C57738d438',
    maxPeriod: maximumPeriod,
    minPeriod: minimumPeriod,
    initialPeriod: period,
    superAdmin: msig,
    initialAdmins: [msig],
  };

  await deployThroughDeterministicFactory({
    deployer,
    name: 'UniswapV3Adapter',
    salt: 'MF-Uniswap-V3-Adapter-V1',
    contract: 'solidity/contracts/adapters/UniswapV3Adapter.sol:UniswapV3Adapter',
    bytecode,
    constructorArgs: {
      types: [
        'tuple(address uniswapV3Oracle,uint16 maxPeriod,uint16 minPeriod,uint16 initialPeriod,address superAdmin,address[] initialAdmins)',
      ],
      values: [config],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 3_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['UniswapV3Adapter'];
export default deployFunction;
