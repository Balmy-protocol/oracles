import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { UniswapV3AdapterMock, UniswapV3AdapterMock__factory, IStaticOracle, IUniswapV3Pool } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import moment from 'moment';
import { IUniswapV3Adapter } from 'typechained/solidity/contracts/adapters/UniswapV3Adapter';
import { shouldBeExecutableOnlyByRole } from '@utils/behaviours';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';

chai.use(smock.matchers);

describe('UniswapV3Adapter', () => {
  const MAX_PERIOD = moment.duration(20, 'minutes').asSeconds();
  const MIN_PERIOD = moment.duration(1, 'minutes').asSeconds();
  const INITIAL_PERIOD = moment.duration(5, 'minutes').asSeconds();
  const INITIAL_CARDINALITY = 100;
  const TOKEN_A = '0x0000000000000000000000000000000000000003';
  const TOKEN_B = '0x0000000000000000000000000000000000000004';

  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let adapterFactory: UniswapV3AdapterMock__factory;
  let adapter: UniswapV3AdapterMock;
  let superAdminRole: string, adminRole: string;
  let oracle: FakeContract<IStaticOracle>;
  let pool1: FakeContract<IUniswapV3Pool>, pool2: FakeContract<IUniswapV3Pool>;
  let initialConfig: IUniswapV3Adapter.InitialConfigStruct;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracle = await smock.fake('IStaticOracle');
    oracle.CARDINALITY_PER_MINUTE.returns(INITIAL_CARDINALITY);
    pool1 = await smock.fake('IUniswapV3Pool');
    pool2 = await smock.fake('IUniswapV3Pool');
    pool1.token0.returns(TOKEN_A);
    pool1.token1.returns(TOKEN_B);
    pool2.token0.returns(TOKEN_A);
    pool2.token1.returns(TOKEN_B);
    adapterFactory = await ethers.getContractFactory('solidity/contracts/test/adapters/UniswapV3Adapter.sol:UniswapV3AdapterMock');
    initialConfig = {
      uniswapV3Oracle: oracle.address,
      maxPeriod: MAX_PERIOD,
      minPeriod: MIN_PERIOD,
      initialPeriod: INITIAL_PERIOD,
      superAdmin: superAdmin.address,
      initialAdmins: [admin.address],
    };
    adapter = await adapterFactory.deploy(initialConfig);
    superAdminRole = await adapter.SUPER_ADMIN_ROLE();
    adminRole = await adapter.ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    oracle.quoteSpecificPoolsWithTimePeriod.reset();
    oracle.prepareSpecificPoolsWithCardinality.reset();
  });

  describe('constructor', () => {
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: adapterFactory,
          args: [{ ...initialConfig, superAdmin: constants.AddressZero }],
          message: 'ZeroAddress',
        });
      });
    });
    when('initial period is lower than min period', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: adapterFactory,
          args: [{ ...initialConfig, initialPeriod: MIN_PERIOD - 1 }],
          message: 'InvalidPeriod',
        });
      });
    });
    when('initial period is higher than max period', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: adapterFactory,
          args: [{ ...initialConfig, initialPeriod: MAX_PERIOD + 1 }],
          message: 'InvalidPeriod',
        });
      });
    });
    when('all arguments are valid', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await adapter.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await adapter.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin role', async () => {
        const admin = await adapter.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('oracle is set correctly', async () => {
        expect(await adapter.UNISWAP_V3_ORACLE()).to.equal(oracle.address);
      });
      then('max period is set correctly', async () => {
        expect(await adapter.MAX_PERIOD()).to.equal(MAX_PERIOD);
      });
      then('min period is set correctly', async () => {
        expect(await adapter.MIN_PERIOD()).to.equal(MIN_PERIOD);
      });
      then('initial period is set correctly', async () => {
        expect(await adapter.period()).to.equal(INITIAL_PERIOD);
      });
      then('initial cardinality is set correctly', async () => {
        expect(await adapter.cardinalityPerMinute()).to.equal(INITIAL_CARDINALITY);
      });
    });
  });

  describe('canSupportPair', () => {
    when('there are no pools', () => {
      given(() => oracle.getAllPoolsForPair.returns([]));
      then('pair cannot be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('all existing pools are denylisted', () => {
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address, pool2.address]);
        await adapter.connect(admin).setDenylisted([pool1.address, pool2.address], [true, true]);
      });
      then('pair cannot be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('there are allowed pools', () => {
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address, pool2.address]);
        await adapter.connect(admin).setDenylisted([pool1.address], [true]);
      });
      then('pair can be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('isPairAlreadySupported', () => {
    when('there are no pools stored', () => {
      then('pair is not already supported', async () => {
        expect(await adapter.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('there are some stored pools', () => {
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address]);
      });
      then('pool is already sipported', async () => {
        expect(await adapter.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('quote', () => {
    when('there are no pools stored', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'quote(address,uint256,address)',
          args: [TOKEN_A, 0, TOKEN_B],
          message: 'PairNotSupportedYet',
        });
      });
    });
    when('quote amount is over uint128', () => {
      let tx: Promise<BigNumber>;
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = adapter['quote(address,uint256,address)'](TOKEN_A, BigNumber.from(2).pow(128), TOKEN_B);
      });
      then('tx is reverted with reason error', async () => {
        expect(tx).to.have.revertedWith(`SafeCast: value doesn't fit in 128 bits`);
      });
    });
    when('there are some stored pools', () => {
      const RESULT = BigNumber.from(10000);
      const MAX_AMOUNT_IN = BigNumber.from(2).pow(128).sub(1);
      let returnedQuote: BigNumber;
      given(async () => {
        oracle.quoteSpecificPoolsWithTimePeriod.returns(RESULT);
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        returnedQuote = await adapter['quote(address,uint256,address)'](TOKEN_A, MAX_AMOUNT_IN, TOKEN_B);
      });
      then('the oracle is called correctly', async () => {
        expect(oracle.quoteSpecificPoolsWithTimePeriod).to.have.been.calledOnceWith(
          MAX_AMOUNT_IN,
          TOKEN_A,
          TOKEN_B,
          [pool1.address, pool2.address],
          INITIAL_PERIOD
        );
      });
      then('the returned result is the same as the oracle', async () => {
        expect(returnedQuote).to.equal(RESULT);
      });
    });
  });

  describe('addOrModifySupportForPair', () => {
    whenPairHasNoPoolsThenCallingEndsInRevert('addOrModifySupportForPair(address,address)');
    whenPairHasPoolsButTheyAreAllDenylistedThenCallingEndsInRevert('addOrModifySupportForPair(address,address)');
    testAddSupportForPair({
      when: 'there are no pools stored before hand',
      func: 'addOrModifySupportForPair(address,address)',
    });
    testAddSupportForPair({
      when: 'there are some pools stored before hand',
      func: 'addOrModifySupportForPair(address,address)',
      context: () => adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]),
    });
  });

  describe('setPeriod', () => {
    when('period is lower than min period', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setPeriod',
          args: [MIN_PERIOD - 1],
          message: 'InvalidPeriod',
        });
      });
    });
    when('period is higher than max period', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setPeriod',
          args: [MAX_PERIOD + 1],
          message: 'InvalidPeriod',
        });
      });
    });
    when('a valid period is provided', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setPeriod(INITIAL_PERIOD + 1);
      });
      then('period is updated', async () => {
        expect(await adapter.period()).to.equal(INITIAL_PERIOD + 1);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(adapter, 'PeriodChanged')
          .withArgs(INITIAL_PERIOD + 1);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setPeriod',
      params: [10],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('setCardinalityPerMinute', () => {
    when('cardinality is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setCardinalityPerMinute',
          args: [0],
          message: 'InvalidCardinalityPerMinute',
        });
      });
    });
    when('a valid cardinality is provided', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setCardinalityPerMinute(INITIAL_CARDINALITY + 1);
      });
      then('cardinality is updated', async () => {
        expect(await adapter.cardinalityPerMinute()).to.equal(INITIAL_CARDINALITY + 1);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(adapter, 'CardinalityPerMinuteChanged')
          .withArgs(INITIAL_CARDINALITY + 1);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setCardinalityPerMinute',
      params: [10],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('setDenylisted', () => {
    when('parameters are invalid', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setDenylisted',
          args: [[], [true]],
          message: 'InvalidDenylistParams',
        });
      });
    });
    when('pools that were not assigned to the pair are denylisted', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setDenylisted([pool1.address], [true]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(pool1.address)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([pool1.address], [true]);
      });
    });
    when('some pools that were assigned to the pair are denylisted', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = await adapter.connect(admin).setDenylisted([pool1.address], [true]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(pool1.address)).to.be.true;
        expect(await adapter.isPoolDenylisted(pool2.address)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([pool1.address], [true]);
      });
      then('assigned pools is calculated correctly', async () => {
        expect(await adapter.getPoolsPreparedForPair(TOKEN_A, TOKEN_B)).to.eql([pool2.address]);
      });
    });
    when('all pools that were assigned to the pair are denylisted', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = await adapter.connect(admin).setDenylisted([pool1.address, pool2.address], [true, true]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(pool1.address)).to.be.true;
        expect(await adapter.isPoolDenylisted(pool2.address)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([pool1.address, pool2.address], [true, true]);
      });
      then('assigned pools is calculated correctly', async () => {
        expect(await adapter.getPoolsPreparedForPair(TOKEN_A, TOKEN_B)).to.eql([]);
      });
    });
    when('addresses are allowlisted back', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.connect(admin).setDenylisted([pool1.address], [true]);
        tx = await adapter.connect(admin).setDenylisted([pool1.address], [false]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(pool1.address)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([pool1.address], [false]);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setDenylisted',
      params: [['0x0000000000000000000000000000000000000001'], [true]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  function whenPairHasNoPoolsThenCallingEndsInRevert(func: string) {
    when('pairs have no pools', () => {
      given(() => {
        oracle.getAllPoolsForPair.returns([]);
      });
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func,
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
  }

  function whenPairHasPoolsButTheyAreAllDenylistedThenCallingEndsInRevert(func: string) {
    when('pairs has pools but they are all denylisted', () => {
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address]);
        await adapter.connect(admin).setDenylisted([pool1.address], [true]);
      });
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func,
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
  }

  function testAddSupportForPair({
    when: title,
    func,
    context,
  }: {
    when: string;
    func: 'addOrModifySupportForPair(address,address)';
    context?: () => Promise<any>;
  }) {
    when(title, () => {
      let tx: TransactionResponse;
      given(async () => {
        await context?.();
        oracle.getAllPoolsForPair.returns([pool1.address, pool2.address]);
        await adapter.connect(admin).setDenylisted([pool1.address], [true]);
        tx = await adapter[func](TOKEN_A, TOKEN_B);
      });
      then('oracle is called correctly', () => {
        const cardinality = BigNumber.from(INITIAL_PERIOD).mul(INITIAL_CARDINALITY).div(60).add(1);
        expect(oracle.prepareSpecificPoolsWithCardinality).to.have.been.calledOnceWith([pool2.address], cardinality);
      });
      then('only allowed pools are stored', async () => {
        const pools = await adapter.getPoolsPreparedForPair(TOKEN_A, TOKEN_B);
        expect(pools).to.eql([pool2.address]);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'UpdatedSupport').withArgs(TOKEN_A, TOKEN_B, [pool2.address]);
      });
    });
  }
});
