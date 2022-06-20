import { deployments, ethers } from 'hardhat';
import { evm, wallet } from '@utils';
import { contract, given, then, when } from '@utils/bdd';
import { expect } from 'chai';
import { getNodeUrl } from 'utils/env';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ITokenPriceOracle } from '@typechained';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '../utils/defillama';
import { BigNumber, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { snapshot } from '@utils/evm';
import { setTestChainId } from 'utils/deploy';

const CHAIN = { chain: 'optimism', chainId: 10 };
const BLOCK_NUMBER = 12350000;
const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

describe('Comprehensive Oracle Test', () => {
  let deployer: SignerWithAddress;

  before(async () => {
    [deployer] = await ethers.getSigners();
    await fork({ ...CHAIN, blockNumber: BLOCK_NUMBER });
  });

  oracleComprehensiveTest({
    oracle: 'StatefulChainlinkOracleAdapter',
    tokenIn: '0x6fd9d7AD17242c41f7131d257212c54A0e816691', // UNI
    tokenOut: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    canOracleWorkWithoutAddingExplicitSupport: false,
  });

  oracleComprehensiveTest({
    oracle: 'UniswapV3Adapter',
    tokenIn: '0x296f55f8fb28e498b858d0bcda06d955b2cb3f97', // STG
    tokenOut: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC
    canOracleWorkWithoutAddingExplicitSupport: false,
  });

  function oracleComprehensiveTest({
    oracle: oracleName,
    tokenIn,
    tokenOut,
    canOracleWorkWithoutAddingExplicitSupport,
  }: {
    oracle: string;
    tokenIn: string;
    tokenOut: string;
    canOracleWorkWithoutAddingExplicitSupport: boolean;
  }) {
    contract(oracleName, () => {
      const ADD_SUPPORT_WITHOUT_DATA = ['addOrModifySupportForPair(address,address)', 'addSupportForPairIfNeeded(address,address)'] as const;
      const ADD_SUPPORT_WITH_DATA = [
        'addOrModifySupportForPair(address,address,bytes)',
        'addSupportForPairIfNeeded(address,address,bytes)',
      ] as const;
      let amountIn: BigNumber, expectedAmountOut: BigNumber;
      let oracle: ITokenPriceOracle;
      let snapshotId: string;
      before(async () => {
        await deployments.fixture([oracleName], { keepExistingDeployments: true });
        oracle = await ethers.getContract<ITokenPriceOracle>(oracleName);
        const { timestamp } = await ethers.provider.getBlock(BLOCK_NUMBER);
        const tokenInData = await getTokenData(CHAIN.chain, tokenIn, timestamp);
        const tokenOutData = await getTokenData(CHAIN.chain, tokenOut, timestamp);
        amountIn = utils.parseUnits('1', tokenInData.decimals);
        expectedAmountOut = convertPriceToBigNumberWithDecimals(tokenInData.price / tokenOutData.price, tokenOutData.decimals);
        snapshotId = await snapshot.take();
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
            expect(await oracle.canSupportPair(constants.AddressZero, constants.AddressZero)).to.be.false;
          });
        });
      });
      describe('isPairAlreadySupported', () => {
        when('asked if a valid is already supported', () => {
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
              const tx = oracle['quote(address,uint256,address)'](tokenIn, amountIn, tokenOut);
              await expect(tx).to.have.reverted;
            });
          });
          when('trying to quote with data, without adding explicit support', () => {
            then('tx reverts', async () => {
              const tx = oracle['quote(address,uint256,address,bytes)'](tokenIn, amountIn, tokenOut, BYTES);
              await expect(tx).to.have.reverted;
            });
          });
        } else {
          when('trying to quote without adding explicit support', () => {
            then('quote returns as expected', async () => {
              const result = await oracle['quote(address,uint256,address)'](tokenIn, amountIn, tokenOut);
              validateQuote(result);
            });
          });
          when('trying to quote with data, without adding explicit support', () => {
            then('quote with data returns as expected', async () => {
              const result = await oracle['quote(address,uint256,address,bytes)'](tokenIn, amountIn, tokenOut, BYTES);
              validateQuote(result);
            });
          });
        }
        executeWhenAddingSupportInDifferentContexts({
          then: 'quote returns as expected',
          validation: async () => {
            const result = await oracle['quote(address,uint256,address)'](tokenIn, amountIn, tokenOut);
            validateQuote(result);
          },
        });
        executeWhenAddingSupportInDifferentContexts({
          then: 'quote with data returns as expected',
          validation: async () => {
            const result = await oracle['quote(address,uint256,address,bytes)'](tokenIn, amountIn, tokenOut, BYTES);
            validateQuote(result);
          },
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
      describe('reverts when adding support', () => {
        // Note: we don't check explicitly that 'PairCannotBeSupported' is thrown because some adapters
        // might let the underlying oracle fail differently
        for (const func of ADD_SUPPORT_WITHOUT_DATA) {
          when('support is added through ' + func + ' for an invalid pair', () => {
            then('tx reverts', async () => {
              const tx = oracle[func](constants.AddressZero, constants.AddressZero);
              await expect(tx).to.have.reverted;
            });
          });
        }
        for (const func of ADD_SUPPORT_WITH_DATA) {
          when('support is added through ' + func + ' for an invalid pair', () => {
            then('tx reverts', async () => {
              const tx = oracle[func](constants.AddressZero, constants.AddressZero, BYTES);
              await expect(tx).to.have.reverted;
            });
          });
        }
      });
      function executeWhenAddingSupportInDifferentContexts({ then: title, validation }: { then: string; validation: () => Promise<any> }) {
        for (const func of ADD_SUPPORT_WITHOUT_DATA) {
          when('support is added through ' + func, () => {
            given(async () => await oracle[func](tokenIn, tokenOut));
            then(title, async () => await validation());
          });
          when('support is added through ' + func + ', in reverse order', () => {
            given(async () => await oracle[func](tokenOut, tokenIn));
            then(title, async () => await validation());
          });
        }
        for (const func of ADD_SUPPORT_WITH_DATA) {
          when('support is added with data through ' + func, () => {
            given(async () => await oracle[func](tokenIn, tokenOut, BYTES));
            then(title, async () => await validation());
          });
          when('support is added with data through ' + func + ', in reverse order', () => {
            given(async () => await oracle[func](tokenOut, tokenIn, BYTES));
            then(title, async () => await validation());
          });
        }
      }
    });
  }

  const DETERMINISTIC_FACTORY_ADMIN = '0x1a00e1e311009e56e3b0b9ed6f86f5ce128a1c01';
  const DEPLOYER_ROLE = utils.keccak256(utils.toUtf8Bytes('DEPLOYER_ROLE'));
  async function fork({ chain, chainId, blockNumber }: { chain: string; chainId: number; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      jsonRpcUrl: getNodeUrl(chain),
      blockNumber,
    });
    setTestChainId(chainId);
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(DETERMINISTIC_FACTORY_ADMIN);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );
    await deterministicFactory.connect(admin).grantRole(DEPLOYER_ROLE, deployer.address);
  }
});
