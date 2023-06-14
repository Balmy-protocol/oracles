import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@utils';
import { API3ChainlinkAdapter, API3ChainlinkAdapterFactory, API3ChainlinkAdapter__factory, StatefulChainlinkOracle } from '@typechained';
import { BigNumber, BytesLike, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';
import { address as DETERMINISTIC_FACTORY_ADDRESS } from '@mean-finance/deterministic-factory/deployments/ethereum/DeterministicFactory.json';
import { JsonRpcSigner } from '@ethersproject/providers';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { snapshot } from '@utils/evm';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '@utils/defillama';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry/dist';

const BLOCK_NUMBER = 43876587;
const EMPTY_BYTES: BytesLike = [];
const DAI = '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063';
const USD = '0x0000000000000000000000000000000000000348';

// Skipped because hardhat caches chain data, so if we try to test this on Polygon and then other tests use Ethereum, everything breakes
// Tried a few workarounds, but failed :( So we will simply disable this test and run it manually when necessary. Also, we can't test this
// on Ethereum since there are no funded/active feeds at the moment
describe.skip('API3ChainlinkAdapter', () => {
  let factory: API3ChainlinkAdapterFactory;
  let oracle: StatefulChainlinkOracle;
  let registry: ChainlinkRegistry;
  let admin: JsonRpcSigner;
  let snapshotId: string;

  before(async () => {
    // Fork and deploy
    await fork({ chain: 'polygon', blockNumber: BLOCK_NUMBER });
    await deployments.run(['ChainlinkFeedRegistry', 'StatefulChainlinkOracle', 'API3ChainlinkAdapterFactory'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });
    const { msig } = await getNamedAccounts();
    admin = await wallet.impersonate(msig);

    // Set up contracts
    factory = await ethers.getContract<API3ChainlinkAdapterFactory>('API3ChainlinkAdapterFactory');
    registry = await ethers.getContract<ChainlinkRegistry>('ChainlinkFeedRegistry');
    oracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');

    // Set up DAI feed
    await registry.connect(admin).assignFeeds([{ base: DAI, quote: USD, feed: '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D' }]);

    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  adapterTest({
    symbol: 'LDO',
    address: '0xC3C7d422809852031b44ab29EEC9F1EfF2A58756',
    proxy: '0x774F0C833ceaacA9b472771FfBE3ada4d6805709',
  });

  adapterTest({
    symbol: 'SAND',
    address: '0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683',
    proxy: '0x1bF3b112556a536d4C051a014B439d1F34cf4CD8',
  });

  function adapterTest({ address, symbol, proxy }: { address: string; symbol: string; proxy: string }) {
    when(`using an adapter for ${symbol}`, () => {
      let adapter: API3ChainlinkAdapter;
      given(async () => {
        // Set up adapter
        await factory.createAdapter(proxy, 8, `${symbol}/USD`);
        const adapterAddress = await factory.computeAdapterAddress(proxy, 8, `${symbol}/USD`);
        adapter = API3ChainlinkAdapter__factory.connect(adapterAddress, ethers.provider);

        // Add to registry
        await registry.connect(admin).assignFeeds([{ base: address, quote: USD, feed: adapter.address }]);

        // Prepare support
        await oracle.addSupportForPairIfNeeded(address, DAI, EMPTY_BYTES);
      });
      then('quote is calculated correctly', async () => {
        const quote = await oracle.quote(address, utils.parseEther('1'), DAI, EMPTY_BYTES);
        await validateQuote(quote, address, DAI);
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
