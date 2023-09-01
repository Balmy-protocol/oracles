import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@utils';
import { DIAChainlinkAdapter, DIAChainlinkAdapterFactory, DIAChainlinkAdapter__factory, StatefulChainlinkOracle } from '@typechained';
import { BigNumber, BytesLike, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';
import { address as DETERMINISTIC_FACTORY_ADDRESS } from '@mean-finance/deterministic-factory/deployments/ethereum/DeterministicFactory.json';
import { JsonRpcSigner } from '@ethersproject/providers';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { snapshot } from '@utils/evm';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '@utils/defillama';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry/dist';

const BLOCK_NUMBER = 47015984;
const EMPTY_BYTES: BytesLike = [];
const POLYGON_DAI = '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063';
const POLYGON_USDC = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const USD = '0x0000000000000000000000000000000000000348';
const CHAINLINK_POLYGON_USDC_USD = '0xfe4a8cc5b5b2366c1b58bea3858e81843581b2f7';
const CHAINLINK_POLYGON_DAI_USD = '0x4746dec9e833a82ec7c2c1356372ccf2cfcd2f3d';

const DIA_ORACLE_POLYGON = '0xf44b3c104f39209cd8420a1d3ca4338818aa72ab';

// Skipped because hardhat caches chain data, so if we try to test this on Polygon and then other tests use Ethereum, everything breakes
// Tried a few workarounds, but failed :( So we will simply disable this test and run it manually when necessary. Also, we can't test this
// on Ethereum since there are no funded/active feeds at the moment
describe('DIAChainlinkAdapter', () => {
  let factory: DIAChainlinkAdapterFactory;
  let oracle: StatefulChainlinkOracle;
  let registry: ChainlinkRegistry;
  let admin: JsonRpcSigner;
  let snapshotId: string;

  before(async () => {
    // Fork and deploy
    await fork({ chain: 'polygon', blockNumber: BLOCK_NUMBER });
    await deployments.run(['ChainlinkFeedRegistry', 'StatefulChainlinkOracle', 'DIAChainlinkAdapterFactory'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });
    const { msig } = await getNamedAccounts();
    admin = await wallet.impersonate(msig);

    // Set up contracts
    factory = await ethers.getContract<DIAChainlinkAdapterFactory>('DIAChainlinkAdapterFactory');
    registry = await ethers.getContract<ChainlinkRegistry>('ChainlinkFeedRegistry');
    oracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');

    // Set up POLYGON_USDC feed
    await registry.connect(admin).assignFeeds([{ base: POLYGON_USDC, quote: USD, feed: CHAINLINK_POLYGON_USDC_USD }]);

    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  adapterTest({
    symbol: 'ETH',
    address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // POLYGON
    decimals: 18,
  });

  adapterTest({
    symbol: 'BTC',
    address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', // POLYGON
    decimals: 8,
  });

  function adapterTest({ address, symbol, decimals }: { address: string; symbol: string; decimals: number }) {
    when(`using an adapter for ${symbol}`, () => {
      let adapter: DIAChainlinkAdapter;
      given(async () => {
        // Set up adapter
        await factory.createAdapter(DIA_ORACLE_POLYGON, 8, `${symbol}/USD`);
        const adapterAddress = await factory.computeAdapterAddress(DIA_ORACLE_POLYGON, 8, `${symbol}/USD`);
        adapter = DIAChainlinkAdapter__factory.connect(adapterAddress, ethers.provider);

        // Add to registry
        await registry.connect(admin).assignFeeds([{ base: address, quote: USD, feed: adapter.address }]);

        // Prepare support
        await oracle.addSupportForPairIfNeeded(address, POLYGON_USDC, EMPTY_BYTES);
      });
      then('quote is calculated correctly', async () => {
        const quote = await oracle.quote(address, utils.parseUnits('1', decimals), POLYGON_USDC, EMPTY_BYTES);
        await validateQuote(quote, address, POLYGON_USDC);
      });
      then('description is set correctly', async () => {
        expect(await adapter.description()).to.equal(`${symbol}/USD`);
      });
      then('decimals are set correctly', async () => {
        expect(await adapter.decimals()).to.equal(8);
      });
    });
  }

  async function validateQuote(quote: BigNumber, tokenIn: string, tokenOut: string, thresholdPercentage?: number) {
    const { timestamp } = await ethers.provider.getBlock(BLOCK_NUMBER);
    const tokenInData = await getTokenData('polygon', tokenIn, timestamp);
    const tokenOutData = await getTokenData('polygon', tokenOut, timestamp);
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
    const { deployer: deployerAddress, msig } = await getNamedAccounts();
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      DETERMINISTIC_FACTORY_ADDRESS
    );
    await deterministicFactory.connect(admin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployerAddress);
  }
});
