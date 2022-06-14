import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { UniswapV3Adapter, UniswapV3Adapter__factory, IStaticOracle } from '@typechained';
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
  const POOL1 = '0x0000000000000000000000000000000000000001';
  const POOL2 = '0x0000000000000000000000000000000000000002';
  const TOKEN_A = '0x0000000000000000000000000000000000000003';
  const TOKEN_B = '0x0000000000000000000000000000000000000004';

  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let adapterFactory: UniswapV3Adapter__factory;
  let adapter: UniswapV3Adapter;
  let superAdminRole: string, adminRole: string;
  let oracle: FakeContract<IStaticOracle>;
  let initialConfig: IUniswapV3Adapter.InitialConfigStruct;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracle = await smock.fake('IStaticOracle');
    oracle.CARDINALITY_PER_MINUTE.returns(INITIAL_CARDINALITY);
    adapterFactory = await ethers.getContractFactory('solidity/contracts/adapters/UniswapV3Adapter.sol:UniswapV3Adapter');
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
        oracle.getAllPoolsForPair.returns([POOL1, POOL2]);
        await adapter.connect(admin).setDenylisted([POOL1, POOL2], [true, true]);
      });
      then('pair cannot be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('there are allowed pools', () => {
      given(() => oracle.getAllPoolsForPair.returns([POOL1, POOL2]));
      then('pair can be supported', async () => {
        expect(await adapter.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
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
    const ADDRESS = '0x0000000000000000000000000000000000000001';
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
    when('addresses are denylisted', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await adapter.connect(admin).setDenylisted([ADDRESS], [true]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(ADDRESS)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([ADDRESS], [true]);
      });
    });
    when('addresses are allowlisted back', () => {
      let tx: TransactionResponse;
      given(async () => {
        await adapter.connect(admin).setDenylisted([ADDRESS], [true]);
        tx = await adapter.connect(admin).setDenylisted([ADDRESS], [false]);
      });
      then('their status is updated', async () => {
        expect(await adapter.isPoolDenylisted(ADDRESS)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(adapter, 'DenylistChanged').withArgs([ADDRESS], [false]);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => adapter,
      funcAndSignature: 'setDenylisted',
      params: [[ADDRESS], [true]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });
});
