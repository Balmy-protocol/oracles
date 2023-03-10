import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@utils';
import { TransformerOracle } from '@typechained';
import { BigNumber, BytesLike, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';
import { address as DETERMINISTIC_FACTORY_ADDRESS } from '@mean-finance/deterministic-factory/deployments/ethereum/DeterministicFactory.json';
import { ProtocolTokenWrapperTransformer, TransformerRegistry } from '@mean-finance/transformers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { snapshot } from '@utils/evm';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '@utils/defillama';

const BLOCK_NUMBER = 16791195;
const EMPTY_BYTES: BytesLike = [];

const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const STETH = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';
const WSTETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
const EULER_WSTETH = '0x7C6D161b367Ec0605260628c37B8dd778446256b';

describe('TransformerOracle', () => {
  let oracle: TransformerOracle;
  let transformerRegistry: TransformerRegistry;
  let admin: JsonRpcSigner;
  let snapshotId: string;

  before(async () => {
    await fork({ chain: 'ethereum', blockNumber: BLOCK_NUMBER });
    const { msig } = await getNamedAccounts();
    admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: msig, balance: utils.parseEther('10') });
    await deployments.run(
      [
        'ChainlinkFeedRegistry',
        'TransformerRegistry',
        'ProtocolTokenWrapperTransformer',
        'wstETHTransformer',
        'ERC4626Transformer',
        'TransformerOracle',
      ],
      {
        resetMemory: true,
        deletePreviousDeployments: false,
        writeDeploymentsToFiles: false,
      }
    );
    oracle = await ethers.getContract<TransformerOracle>('TransformerOracle');
    transformerRegistry = await ethers.getContract<TransformerRegistry>('TransformerRegistry');
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });
  describe('using the transformer oracle', async () => {
    when('using the wstETH transformer', () => {
      given(async () => {
        const wstETHTransformer = await ethers.getContract('wstETHTransformer');
        // Register WSTETH to wstETH transformer
        await transformerRegistry.connect(admin).registerTransformers([
          {
            transformer: wstETHTransformer.address,
            dependents: [WSTETH],
          },
        ]);
        await oracle.addSupportForPairIfNeeded(WSTETH, STETH, EMPTY_BYTES);
        await oracle.addSupportForPairIfNeeded(STETH, DAI, EMPTY_BYTES);
      });
      then('the pair is transformed correctly', async () => {
        const wstETHToDaiQuote = await oracle.quote(WSTETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
        await validateQuote(wstETHToDaiQuote, WSTETH, DAI);
        const wstETHToSTETHQuote = await oracle.quote(WSTETH, utils.parseEther('1'), STETH, EMPTY_BYTES);
        await validateQuote(wstETHToSTETHQuote, WSTETH, STETH, 0.5);
        const stETHToWSTETH = await oracle.quote(STETH, utils.parseEther('1'), WSTETH, EMPTY_BYTES);
        await validateQuote(stETHToWSTETH, STETH, WSTETH, 0.5);
      });
    });

    when('using both the wstETH and erc4626 transformer', () => {
      given(async () => {
        const wstETHTransformer = await ethers.getContract('wstETHTransformer');
        const erc4626Transformer = await ethers.getContract('ERC4626Transformer');
        // Register transformers
        await transformerRegistry.connect(admin).registerTransformers([
          {
            transformer: wstETHTransformer.address,
            dependents: [WSTETH],
          },
          {
            transformer: erc4626Transformer.address,
            dependents: [EULER_WSTETH],
          },
        ]);
        await oracle.addSupportForPairIfNeeded(EULER_WSTETH, DAI, EMPTY_BYTES);
      });
      then('the pair is transformed correctly', async () => {
        const stETHToDAIQuote = await oracle.quote(STETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
        await validateQuote(stETHToDAIQuote, STETH, DAI);

        const wstETHToDAIQuote = await oracle.quote(WSTETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
        await validateQuote(wstETHToDAIQuote, WSTETH, DAI);

        const eulerWstETHToDaiQuote = await oracle.quote(EULER_WSTETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
        // Note: since no one is using it, we can check the price of wstETH, since we don't have the price for euler's version yet
        await validateQuote(eulerWstETHToDaiQuote, WSTETH, DAI);
      });
    });

    /* 
     This test is meant to use a lot of different components. The idea is that the quote for WETH => DAI will:
     1. Transform WETH to ETH in the Transformer oracle
     2. Delegate the quote from the aggregator to the Chainlink oracle
     3. Use the Chainlink registry in the Chainlink Oracle
     */
    when('using the protocol token transformer wrapper transformer', () => {
      given(async () => {
        const protocolTokenTransformer = await ethers.getContract<ProtocolTokenWrapperTransformer>('ProtocolTokenWrapperTransformer');
        // Register WETH to protocol token transformer
        await transformerRegistry.connect(admin).registerTransformers([
          {
            transformer: protocolTokenTransformer.address,
            dependents: [WETH],
          },
        ]);
        await oracle.addSupportForPairIfNeeded(WETH, DAI, EMPTY_BYTES);
      });
      then('the pair is transformed correctly', async () => {
        const quote = await oracle.quote(WETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
        await validateQuote(quote, WETH, DAI);
      });
    });
  });

  async function validateQuote(quote: BigNumber, tokenIn: string, tokenOut: string, thresholdPercentage?: number) {
    const { timestamp } = await ethers.provider.getBlock(BLOCK_NUMBER);
    const tokenInData = await getTokenData('ethereum', tokenIn, timestamp);
    const tokenOutData = await getTokenData('ethereum', tokenOut, timestamp);
    const expectedAmountOut = convertPriceToBigNumberWithDecimals(tokenInData.price / tokenOutData.price, tokenOutData.decimals);

    const TRESHOLD_PERCENTAGE = thresholdPercentage ?? 2; // 2% price diff tolerance

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

  async function fork({ chain, blockNumber }: { chain: string; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      network: chain,
      blockNumber,
    });
    const { deployer: deployerAddress } = await getNamedAccounts();
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate('0xEC864BE26084ba3bbF3cAAcF8F6961A9263319C4');
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      DETERMINISTIC_FACTORY_ADDRESS
    );
    await deterministicFactory.connect(admin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployerAddress);
  }
});
