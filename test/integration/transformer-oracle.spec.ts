import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@utils';
import { TransformerOracle } from '@typechained';
import { BigNumber, BytesLike, constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';
import { ProtocolTokenWrapperTransformer, TransformerRegistry } from '@mean-finance/transformers';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { snapshot } from '@utils/evm';
import { convertPriceToBigNumberWithDecimals, getTokenData } from '@utils/defillama';

const BLOCK_NUMBER = 15321801;
const EMPTY_BYTES: BytesLike = [];

const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

describe('TransformerOracle', () => {
  let oracle: TransformerOracle;
  let snapshotId: string;

  before(async () => {
    await fork({ chain: 'ethereum', blockNumber: BLOCK_NUMBER });
    const { msig } = await getNamedAccounts();
    const admin = await wallet.impersonate(msig);
    await wallet.setBalance({ account: msig, balance: utils.parseEther('10') });
    await deployments.run(['ChainlinkFeedRegistry', 'TransformerRegistry', 'ProtocolTokenWrapperTransformer', 'TransformerOracle'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });
    oracle = await ethers.getContract<TransformerOracle>('TransformerOracle');
    const protocolTokenTransformer = await ethers.getContract<ProtocolTokenWrapperTransformer>('ProtocolTokenWrapperTransformer');
    const transformerRegistry = await ethers.getContract<TransformerRegistry>('TransformerRegistry');

    // Register WETH to protocol token transformer
    await transformerRegistry.connect(admin).registerTransformers([
      {
        transformer: protocolTokenTransformer.address,
        dependents: [WETH],
      },
    ]);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  /* 
   This test is meant to use a lot of different components. The idea is that the quote for WETH => DAI will:
   1. Transform WETH to ETH in the Transformer oracle
   2. Delegate the quote from the aggregator to the Chainlink oracle
   3. Use the Chainlink registry in the Chainlink Oracle
   */
  when('using the transformer oracle', async () => {
    given(async () => {
      await oracle.addSupportForPairIfNeeded(WETH, DAI, EMPTY_BYTES);
    });
    then('the pair is transformed correctly', async () => {
      const quote = await oracle.quote(WETH, utils.parseEther('1'), DAI, EMPTY_BYTES);
      validateQuote(quote);
    });
  });
  async function validateQuote(quote: BigNumber) {
    const { timestamp } = await ethers.provider.getBlock(BLOCK_NUMBER);
    const tokenInData = await getTokenData('ethereum', WETH, timestamp);
    const tokenOutData = await getTokenData('ethereum', DAI, timestamp);
    const expectedAmountOut = convertPriceToBigNumberWithDecimals(tokenInData.price / tokenOutData.price, tokenOutData.decimals);

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

  async function fork({ chain, blockNumber }: { chain: string; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      network: chain,
      blockNumber,
    });
    const { deployer: deployerAddress, eoaAdmin } = await getNamedAccounts();
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(eoaAdmin);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );
    await deterministicFactory.connect(admin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployerAddress);
  }
});
