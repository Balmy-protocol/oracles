import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  UniswapV3AdapterMock,
  UniswapV3AdapterMock__factory,
  IStaticOracle,
  IUniswapV3Pool,
  IERC165__factory,
  ITokenPriceOracle__factory,
  IUniswapV3Adapter__factory,
  IAccessControl__factory,
  IERC20__factory,
  Multicall__factory,
  UniswapV3PoolMock,
  UniswapV3PoolMock__factory,
} from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract, MockContract } from '@defi-wonderland/smock';
import moment from 'moment';
import { IUniswapV3Adapter } from 'typechained/solidity/contracts/adapters/UniswapV3Adapter';
import { shouldBeExecutableOnlyByRole } from '@utils/behaviours';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';
import { readArgFromEventOrFail } from '@utils/event-utils';

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
    oracle.getAllPoolsForPair.reset();
    pool1.liquidity.reset();
    pool2.liquidity.reset();
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
      then('super admin role is set as super admin role', async () => {
        const admin = await adapter.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
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
      then('initial gas per cardinality is set correctly', async () => {
        expect(await adapter.gasPerCardinality()).to.equal(22_250);
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
    when('call to oracle reverts', () => {
      given(() => oracle.getAllPoolsForPair.reverts());
      then('pair cannot be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('there are polls but pair is denylisted', () => {
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address, pool2.address]);
        await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
      then('pair cannot be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('there are pools and pair is allowed', () => {
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address, pool2.address]);
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
          func: 'quote',
          args: [TOKEN_A, 0, TOKEN_B, []],
          message: 'PairNotSupportedYet',
        });
      });
    });
    when('quote amount is over uint128', () => {
      let tx: Promise<BigNumber>;
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = adapter.quote(TOKEN_A, BigNumber.from(2).pow(128), TOKEN_B, []);
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
        returnedQuote = await adapter.quote(TOKEN_A, MAX_AMOUNT_IN, TOKEN_B, []);
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

  describe('_addOrModifySupportForPair', () => {
    const TARGET_CARDINALITY = BigNumber.from(INITIAL_PERIOD).mul(INITIAL_CARDINALITY).div(60).add(1).toNumber();
    let gasForOnePool: BigNumber;
    let pool1: MockContract<UniswapV3PoolMock>, pool2: MockContract<UniswapV3PoolMock>;
    given(async () => {
      const gasPerCardinality = await adapter.gasPerCardinality();
      const factory = await smock.mock<UniswapV3PoolMock__factory>('UniswapV3PoolMock');
      pool1 = await factory.deploy(gasPerCardinality);
      pool2 = await factory.deploy(gasPerCardinality);
      gasForOnePool = BigNumber.from(gasPerCardinality).mul(TARGET_CARDINALITY).add(2_000_000);
      await adapter.setAvailablePools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
    });
    when('pairs has no pools', () => {
      given(async () => {
        await adapter.setAvailablePools(TOKEN_A, TOKEN_B, []);
      });
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'internalAddOrModifySupportForPair',
          args: [TOKEN_A, TOKEN_B, []],
          message: 'PairCannotBeSupported',
        });
      });
    });
    when('pair is denylisted', () => {
      given(async () => {
        await adapter.setAvailablePools(TOKEN_A, TOKEN_B, [pool1.address]);
        await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'internalAddOrModifySupportForPair',
          args: [TOKEN_A, TOKEN_B, []],
          message: 'PairCannotBeSupported',
        });
      });
    });

    when('there is enough gas left for all pools', () => {
      describe('and all pools need increase', () => {
        let tx: TransactionResponse;
        given(async () => {
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, []);
        });
        thenPoolIsIncreased(() => pool1);
        thenPoolIsIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
      describe('and only one pool needs increase', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, TARGET_CARDINALITY);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, []);
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
      describe('and no pools need increase', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, TARGET_CARDINALITY);
          setCurrentCardinality(pool2, TARGET_CARDINALITY);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, []);
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsNotIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
    });

    when('there is enough gas to initialize one pool', () => {
      describe('and the first one needs initializing', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, 0);
          setCurrentCardinality(pool2, 0);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: gasForOnePool });
        });
        thenPoolIsIncreased(() => pool1);
        thenPoolIsNotIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1] }));
      });
      describe('and the first is already initialized', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, TARGET_CARDINALITY);
          setCurrentCardinality(pool2, 0);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: gasForOnePool });
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
      describe('and they are all initialized', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, TARGET_CARDINALITY);
          setCurrentCardinality(pool2, TARGET_CARDINALITY);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: gasForOnePool });
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsNotIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
    });

    when('there is not enough gas for pool initialization', () => {
      describe('and they are all initialized', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, TARGET_CARDINALITY);
          setCurrentCardinality(pool2, TARGET_CARDINALITY);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: 1_000_000 });
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsNotIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1, pool2] }));
      });
      describe('and one of them needs to be initialized', () => {
        let tx: TransactionResponse;
        given(async () => {
          setCurrentCardinality(pool1, 0);
          setCurrentCardinality(pool2, TARGET_CARDINALITY);
          tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: 1_000_000 });
        });
        thenPoolIsNotIncreased(() => pool1);
        thenPoolIsNotIncreased(() => pool2);
        thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool2] }));
      });
      describe('all of them need to be initialized', () => {
        let tx: Promise<TransactionResponse>;
        given(async () => {
          setCurrentCardinality(pool1, 0);
          setCurrentCardinality(pool2, 0);
          tx = adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: 1_000_000 });
        });
        then('tx is reverted with reason error', async () => {
          expect(tx).to.have.revertedWith('GasTooLow');
        });
      });
    });

    when('there are some pools stored before hand', () => {
      let tx: TransactionResponse;
      given(async () => {
        setCurrentCardinality(pool1, 0);
        setCurrentCardinality(pool2, 0);
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = await adapter.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, [], { gasLimit: gasForOnePool });
      });
      thenPoolIsIncreased(() => pool1);
      thenPoolIsNotIncreased(() => pool2);
      thenPoolsAreStoredAndEventIsEmitted(() => ({ tx, pools: [pool1] }));
    });

    function thenPoolIsIncreased(pool: () => MockContract<UniswapV3PoolMock>) {
      then('pool is increased correctly', () => {
        expect(pool().increaseObservationCardinalityNext).to.have.been.calledOnceWith(TARGET_CARDINALITY);
      });
    }
    function thenPoolIsNotIncreased(pool: () => MockContract<UniswapV3PoolMock>) {
      then('pool is not increased', () => {
        expect(pool().increaseObservationCardinalityNext).to.not.have.been.called;
      });
    }
    function thenPoolsAreStoredAndEventIsEmitted(args: () => { tx: TransactionResponse; pools: MockContract<UniswapV3PoolMock>[] }) {
      then('correct pools stored', async () => {
        const preparedPools = await adapter.getPoolsPreparedForPair(TOKEN_A, TOKEN_B);
        expect(preparedPools).to.eql(args().pools.map(({ address }) => address));
      });
      then('event is emitted', async () => {
        await expect(args().tx).to.emit(adapter, 'UpdatedSupport').withArgs(TOKEN_A, TOKEN_B, args().pools.length);
      });
    }
    function setCurrentCardinality(pool: MockContract<UniswapV3PoolMock>, cardinality: number) {
      pool.slot0.returns([constants.Zero, 0, 0, 0, cardinality, 0, true]);
    }
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

  describe('setGasPerCardinality', () => {
    when('gas cost  is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setGasPerCardinality',
          args: [0],
          message: 'InvalidGasPerCardinality',
        });
      });
    });
    when('a valid gas cost is provided', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setGasPerCardinality(5000);
      });
      then('gas cost is updated', async () => {
        expect(await adapter.gasPerCardinality()).to.equal(5000);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'GasPerCardinalityChanged').withArgs(5000);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setGasPerCardinality',
      params: [10],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('setGasCostToSupportPool', () => {
    when('gas cost  is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter.connect(admin),
          func: 'setGasCostToSupportPool',
          args: [0],
          message: 'InvalidGasCostToSupportPool',
        });
      });
    });
    when('a valid gas cost is provided', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setGasCostToSupportPool(5000);
      });
      then('gas cost is updated', async () => {
        expect(await adapter.gasCostToSupportPool()).to.equal(5000);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'GasCostToSupportPoolChanged').withArgs(5000);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setGasCostToSupportPool',
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
    when('pair is denylisted', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
      then('its status is updated', async () => {
        expect(await adapter.isPairDenylisted(TOKEN_A, TOKEN_B)).to.be.true;
      });
      then('event is emitted', async () => {
        await expectEventToBe(tx, [{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
    });
    when('pair is denylisted and some pools were assigned to the it', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.setPools(TOKEN_A, TOKEN_B, [pool1.address, pool2.address]);
        tx = await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
      then('its status is updated', async () => {
        expect(await adapter.isPairDenylisted(TOKEN_A, TOKEN_B)).to.be.true;
      });
      then('event is emitted', async () => {
        await expectEventToBe(tx, [{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
      });
      then('assigned pools are removed', async () => {
        expect(await adapter.getPoolsPreparedForPair(TOKEN_A, TOKEN_B)).to.eql([]);
      });
    });
    when('pair is allowlisted back', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]);
        tx = await adapter.connect(admin).setDenylisted([{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [false]);
      });
      then('its status is updated', async () => {
        expect(await adapter.isPairDenylisted(TOKEN_A, TOKEN_B)).to.be.false;
      });
      then('event is emitted', async () => {
        await expectEventToBe(tx, [{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [false]);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setDenylisted',
      params: [[{ tokenA: TOKEN_A, tokenB: TOKEN_B }], [true]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('_getAllPoolsSortedByLiquidity', () => {
    let pool3: FakeContract<IUniswapV3Pool>;
    given(async () => {
      pool3 = await smock.fake('IUniswapV3Pool');
    });
    when('there are no pools', () => {
      let result: string[];
      given(async () => {
        oracle.getAllPoolsForPair.returns([]);
        result = await adapter.internalGetAllPoolsSortedByLiquidity(TOKEN_A, TOKEN_B);
      });
      then('result is as expected', () => {
        expect(result).to.have.lengthOf(0);
      });
      then('oracle was called correctly', () => {
        expect(oracle.getAllPoolsForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
    });
    when('there is only one pool', () => {
      let result: string[];
      given(async () => {
        oracle.getAllPoolsForPair.returns([pool1.address]);
        result = await adapter.internalGetAllPoolsSortedByLiquidity(TOKEN_A, TOKEN_B);
      });
      then('pool is not called', () => {
        expect(pool1.liquidity).to.not.have.been.called;
      });
      then('result is as expected', () => {
        expect(result).to.eql([pool1.address]);
      });
      then('oracle was called correctly', () => {
        expect(oracle.getAllPoolsForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
      });
    });
    sortedTest({
      pools: () => [
        { pool: pool1, liquidity: 10 },
        { pool: pool2, liquidity: 20 },
        { pool: pool3, liquidity: 30 },
      ],
      expected: () => [pool3, pool2, pool1],
    });
    sortedTest({
      pools: () => [
        { pool: pool1, liquidity: 30 },
        { pool: pool2, liquidity: 20 },
        { pool: pool3, liquidity: 10 },
      ],
      expected: () => [pool1, pool2, pool3],
    });
    sortedTest({
      pools: () => [
        { pool: pool1, liquidity: 0 },
        { pool: pool2, liquidity: 100 },
        { pool: pool3, liquidity: 50 },
      ],
      expected: () => [pool2, pool3, pool1],
    });

    function sortedTest({
      pools,
      expected,
    }: {
      pools: () => { pool: FakeContract<IUniswapV3Pool>; liquidity: number }[];
      expected: () => FakeContract<IUniswapV3Pool>[];
    }) {
      when('getting pools by liquidity', () => {
        let result: string[];
        given(async () => {
          oracle.getAllPoolsForPair.returns([pool1.address, pool2.address, pool3.address]);
          for (const { pool, liquidity } of pools()) {
            pool.liquidity.returns(liquidity);
          }
          result = await adapter.internalGetAllPoolsSortedByLiquidity(TOKEN_A, TOKEN_B);
        });
        then('they are sorted correctly', () => {
          expect(result).to.eql(expected().map(({ address }) => address));
        });
        then('oracle was called correctly', () => {
          expect(oracle.getAllPoolsForPair).to.have.been.calledOnceWith(TOKEN_A, TOKEN_B);
        });
        then('pools were called correctly', () => {
          for (const { pool } of pools()) {
            expect(pool.liquidity).to.have.been.calledOnce;
          }
        });
      });
    }
  });

  describe('supportsInterface', () => {
    behaviours.shouldSupportInterface({
      contract: () => adapter,
      interfaceName: 'IERC165',
      interface: IERC165__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => adapter,
      interfaceName: 'Multicall',
      interface: Multicall__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => adapter,
      interfaceName: 'ITokenPriceOracle',
      interface: ITokenPriceOracle__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => adapter,
      interfaceName: 'IUniswapV3Adapter',
      interface: {
        actual: IUniswapV3Adapter__factory.createInterface(),
        inheritedFrom: [ITokenPriceOracle__factory.createInterface()],
      },
    });
    behaviours.shouldSupportInterface({
      contract: () => adapter,
      interfaceName: 'IAccessControl',
      interface: IAccessControl__factory.createInterface(),
    });
    behaviours.shouldNotSupportInterface({
      contract: () => adapter,
      interfaceName: 'IERC20',
      interface: IERC20__factory.createInterface(),
    });
  });

  async function expectEventToBe(tx: TransactionResponse, pairs: { tokenA: string; tokenB: string }[], denylisted: boolean[]) {
    const actualPairs = await readArgFromEventOrFail<{ tokenA: string; tokenB: string }[]>(tx, 'DenylistChanged', 'pairs');
    const actualDenylisted = await readArgFromEventOrFail(tx, 'DenylistChanged', 'denylisted');
    expect(actualPairs.length).to.equal(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      expect(actualPairs[i].tokenA).to.equal(pairs[i].tokenA);
      expect(actualPairs[i].tokenB).to.equal(pairs[i].tokenB);
    }
    expect(actualDenylisted).to.eql(denylisted);
  }
});
