import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { behaviours, evm, wallet } from '@utils';
import { contract, given, then, when } from '@utils/bdd';
import { expect } from 'chai';
import { BaseOracle, ITokenPriceOracle__factory, Multicall__factory, OracleAggregator, StatefulChainlinkOracle } from '@typechained';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '../utils/defillama';
import { BigNumber, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory, IERC165__factory, IERC20__factory } from '@mean-finance/deterministic-factory';
import { address as DETERMINISTIC_FACTORY_ADDRESS } from '@mean-finance/deterministic-factory/deployments/optimism/DeterministicFactory.json';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry';
import { snapshot } from '@utils/evm';

const CHAIN = 'optimism';
const BLOCK_NUMBER = 24283642;
const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

const UNI = '0x6fd9d7AD17242c41f7131d257212c54A0e816691';
const DAI = '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1';
const STG = '0x296f55f8fb28e498b858d0bcda06d955b2cb3f97';
const USDC = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';

describe('Comprehensive Oracle Test', () => {
  oracleComprehensiveTest({
    oracle: 'StatefulChainlinkOracle',
    extraFixtures: ['ChainlinkFeedRegistry'],
    tokenIn: UNI,
    tokenOut: DAI,
    canOracleWorkWithoutAddingExplicitSupport: false,
    doBefore: async () => {
      await setFeed(UNI, 'usd', '0x11429eE838cC01071402f21C219870cbAc0a59A0');
      await setStablecoin(DAI);
    },
  });

  oracleComprehensiveTest({
    oracle: 'UniswapV3Adapter',
    tokenIn: STG,
    tokenOut: USDC,
    canOracleWorkWithoutAddingExplicitSupport: false,
  });

  oracleComprehensiveTest({
    oracle: 'IdentityOracle',
    tokenIn: USDC,
    tokenOut: USDC,
    canOracleWorkWithoutAddingExplicitSupport: true,
  });

  oracleComprehensiveTest({
    title: 'OracleAggregator (Chainlink Stateful)',
    oracle: 'OracleAggregator',
    extraFixtures: ['ChainlinkFeedRegistry'],
    tokenIn: UNI,
    tokenOut: DAI,
    canOracleWorkWithoutAddingExplicitSupport: false,
    doBefore: async () => {
      await setFeed(UNI, 'usd', '0x11429eE838cC01071402f21C219870cbAc0a59A0');
      await setStablecoin(DAI);
    },
    extraCheck: async (oracle: OracleAggregator) => {
      // Make sure that this pair is using the Chainlink adapter
      const chainlinkAdapter = await ethers.getContract('StatefulChainlinkOracle');
      await oracle.addSupportForPairIfNeeded(UNI, DAI, BYTES);
      const [assigned] = await oracle.assignedOracle(UNI, DAI);
      expect(assigned).to.equal(chainlinkAdapter.address);
    },
  });

  oracleComprehensiveTest({
    title: 'OracleAggregator (Uniswap v3)',
    oracle: 'OracleAggregator',
    extraFixtures: ['ChainlinkFeedRegistry'],
    tokenIn: STG,
    tokenOut: USDC,
    canOracleWorkWithoutAddingExplicitSupport: false,
    extraCheck: async (oracle: OracleAggregator) => {
      // Make sure that this pair is using the Uniswap v3 adapter
      const uniV3Adapter = await ethers.getContract('UniswapV3Adapter');
      await oracle.addSupportForPairIfNeeded(STG, USDC, BYTES);
      const [assigned] = await oracle.assignedOracle(STG, USDC);
      expect(assigned).to.equal(uniV3Adapter.address);
    },
  });

  function oracleComprehensiveTest({
    oracle: oracleName,
    title,
    tokenIn,
    tokenOut,
    canOracleWorkWithoutAddingExplicitSupport,
    extraFixtures,
    doBefore,
    extraCheck,
  }: {
    title?: string;
    oracle: string;
    tokenIn: string;
    tokenOut: string;
    canOracleWorkWithoutAddingExplicitSupport: boolean;
    doBefore?: () => Promise<any>;
    extraFixtures?: string[];
    extraCheck?: (oracle: any) => Promise<any>;
  }) {
    contract(title ?? oracleName, () => {
      const ADD_SUPPORT = ['addOrModifySupportForPair', 'addSupportForPairIfNeeded'] as const;
      let amountIn: BigNumber, expectedAmountOut: BigNumber;
      let oracle: BaseOracle;
      let snapshotId: string;
      before(async () => {
        await fork({ chain: CHAIN, blockNumber: BLOCK_NUMBER });
        await deployments.run([...(extraFixtures ?? []), oracleName], {
          resetMemory: true,
          writeDeploymentsToFiles: false,
          deletePreviousDeployments: false,
        });
        oracle = await ethers.getContract<BaseOracle>(oracleName);
        await doBefore?.();

        const { timestamp } = await ethers.provider.getBlock(BLOCK_NUMBER);
        const tokenInData = await getTokenData(CHAIN, tokenIn, timestamp);
        const tokenOutData = await getTokenData(CHAIN, tokenOut, timestamp);
        amountIn = utils.parseUnits('1', tokenInData.decimals);
        expectedAmountOut = convertPriceToBigNumberWithDecimals(tokenInData.price / tokenOutData.price, tokenOutData.decimals);
        snapshotId = await snapshot.take();

        // Perform extra check (right after snapshot was taken)
        await extraCheck?.(oracle);
      });
      beforeEach(async () => {
        await snapshot.revert(snapshotId);
      });
      describe('canSupportPair', () => {
        when('asked if a valid can be supported', () => {
          then('the oracle returns true', async () => {
            expect(await oracle.canSupportPair(tokenIn, tokenOut)).to.be.true;
          });
        });
        when('asked if a valid can be supported with reversed tokens', () => {
          then('the oracle returns true', async () => {
            expect(await oracle.canSupportPair(tokenOut, tokenIn)).to.be.true;
          });
        });
        when('asked if a made up pair can be supported', () => {
          then('the oracle returns false', async () => {
            expect(await oracle.canSupportPair(constants.AddressZero, '0x0000000000000000000000000000000000000001')).to.be.false;
          });
        });
      });
      describe('isPairAlreadySupported', () => {
        when('asked if a valid pair is already supported', () => {
          then('the oracle returns ' + canOracleWorkWithoutAddingExplicitSupport, async () => {
            expect(await oracle.isPairAlreadySupported(tokenIn, tokenOut)).to.equal(canOracleWorkWithoutAddingExplicitSupport);
          });
        });
        executeWhenAddingSupportInDifferentContexts({
          then: 'oracle returns true',
          validation: async () => expect(await oracle.isPairAlreadySupported(tokenIn, tokenOut)).to.be.true,
        });
      });
      describe('quote', () => {
        if (!canOracleWorkWithoutAddingExplicitSupport) {
          when('trying to quote without adding explicit support', () => {
            then('tx reverts', async () => {
              const tx = oracle.quote(tokenIn, amountIn, tokenOut, BYTES);
              await expect(tx).to.have.reverted;
            });
          });
        } else {
          when('trying to quote without adding explicit support', () => {
            then('quote returns as expected', async () => {
              const result = await oracle.quote(tokenIn, amountIn, tokenOut, BYTES);
              validateQuote(result);
            });
          });
        }
        executeWhenAddingSupportInDifferentContexts({
          then: 'quote returns as expected',
          validation: async () => {
            const result = await oracle.quote(tokenIn, amountIn, tokenOut, BYTES);
            validateQuote(result);
          },
        });
      });
      describe('reverts when adding support', () => {
        // Note: we don't check explicitly that 'PairCannotBeSupported' is thrown because some adapters
        // might let the underlying oracle fail differently
        for (const func of ADD_SUPPORT) {
          when('support is added through ' + func + ' for an invalid pair', () => {
            then('tx reverts', async () => {
              const tx = oracle[func](constants.AddressZero, '0x0000000000000000000000000000000000000001', BYTES);
              await expect(tx).to.have.reverted;
            });
          });
        }
      });
      function executeWhenAddingSupportInDifferentContexts({ then: title, validation }: { then: string; validation: () => Promise<any> }) {
        for (const func of ADD_SUPPORT) {
          when('support is added through ' + func, () => {
            given(async () => await oracle[func](tokenIn, tokenOut, BYTES));
            then(title, async () => await validation());
          });
          when('support is added through ' + func + ', in reverse order', () => {
            given(async () => await oracle[func](tokenOut, tokenIn, BYTES));
            then(title, async () => await validation());
          });
        }
      }
      describe('multicall', () => {
        when('adding support and quoting in one tx', () => {
          let returnedQuote: string;
          given(async () => {
            const { data: data1 } = await oracle.populateTransaction.addSupportForPairIfNeeded(tokenIn, tokenOut, []);
            const { data: data2 } = await oracle.populateTransaction.quote(tokenIn, amountIn, tokenOut, []);
            [, returnedQuote] = await oracle.callStatic.multicall([data1!, data2!]);
          });
          then('returned quote is valid', async () => {
            validateQuote(BigNumber.from(returnedQuote));
          });
        });
      });
      describe('supportsInterface', () => {
        behaviours.shouldSupportInterface({
          contract: () => oracle,
          interfaceName: 'IERC165',
          interface: IERC165__factory.createInterface(),
        });
        behaviours.shouldSupportInterface({
          contract: () => oracle,
          interfaceName: 'ITokenPriceOracle',
          interface: ITokenPriceOracle__factory.createInterface(),
        });
        behaviours.shouldSupportInterface({
          contract: () => oracle,
          interfaceName: 'Multicall',
          interface: Multicall__factory.createInterface(),
        });
        behaviours.shouldNotSupportInterface({
          contract: () => oracle,
          interfaceName: 'IERC20',
          interface: IERC20__factory.createInterface(),
        });
      });
      function validateQuote(quote: BigNumber) {
        const TRESHOLD_PERCENTAGE = 2; // 2% price diff tolerance

        const threshold = expectedAmountOut.mul(TRESHOLD_PERCENTAGE * 10).div(100 * 10);
        const [upperThreshold, lowerThreshold] = [expectedAmountOut.add(threshold), expectedAmountOut.sub(threshold)];
        const diff = quote.sub(expectedAmountOut);
        const sign = diff.isNegative() ? '-' : '+';
        const diffPercentage = diff.abs().mul(10000).div(expectedAmountOut).toNumber() / 100;

        expect(
          quote.lte(upperThreshold) && quote.gte(lowerThreshold),
          `Expected ${quote.toString()} to be within [${lowerThreshold.toString()},${upperThreshold.toString()}]. Diff was ${sign}${diffPercentage}%`
        ).to.be.true;
      }
    });
  }

  async function setFeed(base: string, quote: 'usd', feed: string) {
    const { msig } = await getNamedAccounts();
    const admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const registry = await ethers.getContract<ChainlinkRegistry>('ChainlinkFeedRegistry');
    await registry.connect(admin).assignFeeds([{ base, quote: '0x0000000000000000000000000000000000000348', feed }]);
  }

  async function setStablecoin(address: string) {
    const { msig } = await getNamedAccounts();
    const admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const oracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');
    await oracle.connect(admin).addMappings([address], ['0x0000000000000000000000000000000000000348']);
  }

  async function fork({ chain, blockNumber }: { chain: string; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      network: chain,
      blockNumber,
    });

    const { deployer, msig } = await getNamedAccounts();
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      DETERMINISTIC_FACTORY_ADDRESS
    );
    await deterministicFactory.connect(admin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployer);
  }
});
