import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { given, then, when } from '@utils/bdd';
import { StatefulChainlinkOracleAdapter, StatefulChainlinkOracleAdapter__factory, IChainlinkOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('StatefulChainlinkOracleAdapter', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000003';
  const TOKEN_B = '0x0000000000000000000000000000000000000004';

  let adapter: StatefulChainlinkOracleAdapter;
  let oracle: FakeContract<IChainlinkOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    oracle = await smock.fake('IChainlinkOracle');
    const adapterFactory: StatefulChainlinkOracleAdapter__factory = await ethers.getContractFactory(
      'solidity/contracts/adapters/StatefulChainlinkOracleAdapter.sol:StatefulChainlinkOracleAdapter'
    );
    adapter = await adapterFactory.deploy(oracle.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    oracle.canSupportPair.reset();
    oracle.planForPair.reset();
    oracle.quote.reset();
    oracle.reconfigureSupportForPair.reset();
    oracle.addSupportForPairIfNeeded.reset();
  });

  describe('constructor', () => {
    when('contract is deployed', () => {
      then('oracle is set correctly', async () => {
        expect(await adapter.CHAINLINK_ORACLE()).to.equal(oracle.address);
      });
    });
  });

  describe('canSupportPair', () => {
    when('adapter is called', () => {
      let canSupport: boolean;
      given(async () => {
        oracle.canSupportPair.returns(true);
        canSupport = await adapter.canSupportPair(TOKEN_A, TOKEN_B);
      });
      then('the oracle is called correctly', async () => {
        expect(oracle.canSupportPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
      then('the returned result is the same as the oracle', async () => {
        expect(canSupport).to.equal(true);
      });
    });
  });

  describe('isPairAlreadySupported', () => {
    when('there is no pricing plan', () => {
      let isAlreadySupported: boolean;
      given(async () => {
        oracle.planForPair.returns(0);
        isAlreadySupported = await adapter.isPairAlreadySupported(TOKEN_A, TOKEN_B);
      });
      then('oracle is called correctly', async () => {
        expect(oracle.planForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
      then('pair is not already supported', async () => {
        expect(isAlreadySupported).to.be.false;
      });
    });
    when('there is a pricing plan', () => {
      let isAlreadySupported: boolean;
      given(async () => {
        oracle.planForPair.returns(1);
        isAlreadySupported = await adapter.isPairAlreadySupported(TOKEN_A, TOKEN_B);
      });
      then('oracle is called correctly', async () => {
        expect(oracle.planForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
      then('pair is already supported', async () => {
        expect(isAlreadySupported).to.be.true;
      });
    });
    when('sending the tokens in inverse order', () => {
      let isAlreadySupported: boolean;
      given(async () => {
        oracle.planForPair.returns(0);
        isAlreadySupported = await adapter.isPairAlreadySupported(TOKEN_B, TOKEN_A);
      });
      then('oracle is called correctly', async () => {
        expect(oracle.planForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
    });
  });

  describe('quote', () => {
    when('quote amount is over uint128', () => {
      let tx: Promise<BigNumber>;
      given(async () => {
        tx = adapter['quote(address,uint256,address)'](TOKEN_A, BigNumber.from(2).pow(128), TOKEN_B);
      });
      then('tx is reverted with reason error', async () => {
        expect(tx).to.have.revertedWith(`SafeCast: value doesn't fit in 128 bits`);
      });
    });
    when('quote is called with valid amount', () => {
      const RESULT = BigNumber.from(10000);
      const MAX_AMOUNT_IN = BigNumber.from(2).pow(128).sub(1);
      let returnedQuote: BigNumber;
      given(async () => {
        oracle.quote.returns(RESULT);
        returnedQuote = await adapter['quote(address,uint256,address)'](TOKEN_A, MAX_AMOUNT_IN, TOKEN_B);
      });
      then('the oracle is called correctly', async () => {
        expect(oracle.quote).to.have.been.calledOnceWith(TOKEN_A, MAX_AMOUNT_IN, TOKEN_B);
      });
      then('the returned result is the same as the oracle', async () => {
        expect(returnedQuote).to.equal(RESULT);
      });
    });
  });

  describe('addOrModifySupportForPair', () => {
    when('adapter is called', () => {
      given(async () => {
        await adapter['addOrModifySupportForPair(address,address)'](TOKEN_A, TOKEN_B);
      });
      then('oracle is called with the same parameters', () => {
        expect(oracle.reconfigureSupportForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
    });
  });

  describe('addSupportForPairIfNeeded', () => {
    when('adapter is called', () => {
      given(async () => {
        await adapter['addSupportForPairIfNeeded(address,address)'](TOKEN_A, TOKEN_B);
      });
      then('oracle is called with the same parameters', () => {
        expect(oracle.addSupportForPairIfNeeded).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
    });
  });
});
