import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants, Signer, utils } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleAggregatorMock,
  OracleAggregatorMock__factory,
  IOracleAggregator__factory,
  ITokenPriceOracle__factory,
  IERC165__factory,
  IERC20__factory,
  IAccessControl__factory,
  Multicall__factory,
  BaseOracle,
} from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { shouldBeExecutableOnlyByRole } from '@utils/behaviours';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';
import { getInterfaceId } from '@utils/erc165';

chai.use(smock.matchers);

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregatorFactory: OracleAggregatorMock__factory;
  let oracleAggregator: OracleAggregatorMock;
  let superAdminRole: string, adminRole: string;
  let oracle1: FakeContract<BaseOracle>, oracle2: FakeContract<BaseOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracleAggregatorFactory = await ethers.getContractFactory('solidity/contracts/test/OracleAggregator.sol:OracleAggregatorMock');
    oracle1 = await deployFakeOracle();
    oracle2 = await deployFakeOracle();
    oracleAggregator = await oracleAggregatorFactory.deploy([oracle1.address, oracle2.address], superAdmin.address, [admin.address]);
    superAdminRole = await oracleAggregator.SUPER_ADMIN_ROLE();
    adminRole = await oracleAggregator.ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    oracle1.addOrModifySupportForPair.reset();
    oracle2.addOrModifySupportForPair.reset();
    oracle1.canSupportPair.returns(true);
    oracle2.canSupportPair.returns(true);
  });

  describe('constructor', () => {
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: oracleAggregatorFactory,
          args: [[], constants.AddressZero, []],
          message: 'ZeroAddress',
        });
      });
    });
    when('initial oracles are not valid oracles', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: oracleAggregatorFactory,
          args: [[constants.AddressZero], superAdmin.address, []],
          message: 'AddressIsNotOracle',
        });
      });
    });
    when('all arguments are valid', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await oracleAggregator.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await oracleAggregator.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin role', async () => {
        const admin = await oracleAggregator.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('oracles are set correctly', async () => {
        const availableOracles = await oracleAggregator.availableOracles();
        expect(availableOracles).to.eql([oracle1.address, oracle2.address]);
      });
    });
  });

  describe('canSupportPair', () => {
    when('neither oracle supports a pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(false);
      });
      then('pair is not supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('oracle1 supports a pair but oracle 2 does not', () => {
      given(() => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(false);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('oracle2 supports a pair but oracle 1 does not', () => {
      given(() => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(true);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('both oracles support a pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(true);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('isPairAlreadySupported', () => {
    when('no oracle has been assigned', () => {
      then('pair is not already supported', async () => {
        expect(await oracleAggregator.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('oracle has been assigned and it still supports the pair', () => {
      given(async () => {
        oracle1.isPairAlreadySupported.returns(true);
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
      });
      then('pair is already supported', async () => {
        expect(await oracleAggregator.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('oracle has been assigned but it does not support the pair', () => {
      given(async () => {
        oracle1.isPairAlreadySupported.returns(false);
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
      });
      then('pair is not already supported', async () => {
        expect(await oracleAggregator.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
  });

  describe('quote', () => {
    when('no oracle is being used for the pair', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator,
          func: 'quote',
          args: [TOKEN_A, 1000, TOKEN_B, BYTES],
          message: `PairNotSupportedYet`,
        });
      });
    });
    when('oracle is being used for pair', () => {
      const RESULT = BigNumber.from(5);
      let amountOut: BigNumber;
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
        oracle1.quote.returns(RESULT);
        amountOut = await oracleAggregator.quote(TOKEN_A, 1000, TOKEN_B, BYTES);
      });
      then('oracle was called', async () => {
        expect(oracle1.quote).to.have.been.calledWith(TOKEN_A, 1000, TOKEN_B, BYTES);
      });
      then('result is what the oracle returned', () => {
        expect(amountOut).to.equal(RESULT);
      });
    });
  });

  describe('addOrModifySupportForPair', () => {
    given(() => {
      oracle1.isPairAlreadySupported.returns(true);
    });
    when('no oracle has been assigned', () => {
      given(async () => {
        await oracleAggregator.addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      thenPairIsModified();
    });
    when(`oracle is assigned but it hasn't been forced`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
        await oracleAggregator.addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      thenPairIsModified();
    });
    when(`oracle was forced but caller is admin`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, true);
        await oracleAggregator.connect(admin).addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      thenPairIsModified();
    });
    when(`oracle was forced but it lost support`, () => {
      given(async () => {
        oracle1.isPairAlreadySupported.returns(false);
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, true);
        await oracleAggregator.addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      thenPairIsModified();
    });
    when(`oracle was forced and caller is not admin`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, true);
        await oracleAggregator.addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      then('pair is not modified', async () => {
        const { wasCalled } = await oracleAggregator.internalAddOrModifyCalled(TOKEN_A, TOKEN_B);
        expect(wasCalled).to.be.false;
      });
    });
    function thenPairIsModified() {
      then('pair is modified', async () => {
        const { wasCalled, data } = await oracleAggregator.internalAddOrModifyCalled(TOKEN_A, TOKEN_B);
        expect(wasCalled).to.be.true;
        expect(data).to.eql(BYTES);
      });
    }
  });

  describe('assignedOracle', () => {
    given(async () => {
      oracle1.canSupportPair.returns(true);
      await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
    });
    when(`pair's addreses are inverted`, () => {
      then(`oracle is still returned`, async () => {
        const { oracle } = await oracleAggregator.assignedOracle(TOKEN_B, TOKEN_A);
        expect(oracle).to.equal(oracle1.address);
      });
    });
    when('addresses are sent sorted', () => {
      then(`oracle is still returned`, async () => {
        const { oracle } = await oracleAggregator.assignedOracle(TOKEN_A, TOKEN_B);
        expect(oracle).to.equal(oracle1.address);
      });
    });
  });

  describe('previewAddOrModifySupportForPair', () => {
    given(() => {
      oracle1.isPairAlreadySupported.returns(true);
      oracle2.isPairAlreadySupported.returns(true);
    });
    when('no oracle has been assigned', () => {
      thenOracleIsCalculatedCorrectly();
    });
    when(`oracle is assigned but it hasn't been forced`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, false);
      });
      thenOracleIsCalculatedCorrectly();
    });
    when(`oracle was forced but caller is admin`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, true);
      });
      thenOracleIsCalculatedCorrectly(() => admin);
    });
    when(`oracle was forced but it lost support`, () => {
      given(async () => {
        oracle1.isPairAlreadySupported.returns(false);
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle1.address, true);
      });
      thenOracleIsCalculatedCorrectly();
    });
    when(`oracle was forced and caller is not admin`, () => {
      given(async () => {
        await oracleAggregator.setOracle(TOKEN_A, TOKEN_B, oracle2.address, true);
      });
      then('then returned oracle is the one that was asigned', async () => {
        const returnedOracle = await oracleAggregator.previewAddOrModifySupportForPair(TOKEN_A, TOKEN_B);
        expect(returnedOracle).to.equal(oracle2.address);
      });
    });
    function thenOracleIsCalculatedCorrectly(signer?: () => Signer) {
      describe('and oracle 1 can support the given pair', () => {
        given(async () => {
          oracle1.canSupportPair.returns(true);
        });
        thenReturnedOracleIs(() => oracle1.address);
      });
      describe('and oracle 1 cant support the given pair', () => {
        given(async () => {
          oracle1.canSupportPair.returns(false);
          oracle2.canSupportPair.returns(true);
        });
        thenReturnedOracleIs(() => oracle2.address);
      });
      describe('but no oracle can support the given pair', () => {
        given(async () => {
          oracle1.canSupportPair.returns(false);
          oracle2.canSupportPair.returns(false);
        });
        thenReturnedOracleIs(() => constants.AddressZero);
      });
      function thenReturnedOracleIs(expected: () => string) {
        then('then returned oracle is as expected', async () => {
          const returnedOracle = signer
            ? await oracleAggregator.connect(signer()).previewAddOrModifySupportForPair(TOKEN_A, TOKEN_B)
            : await oracleAggregator.previewAddOrModifySupportForPair(TOKEN_A, TOKEN_B);

          expect(returnedOracle).to.equal(expected());
        });
      }
    }
  });

  describe('forceOracle', () => {
    when('the given address it not an oracle', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator.connect(admin),
          func: 'forceOracle',
          args: [TOKEN_A, TOKEN_B, constants.AddressZero, BYTES],
          message: `AddressIsNotOracle`,
        });
      });
    });
    when('oracle is forced', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_B, oracle2.address, BYTES);
      });
      then(`oracle is assigned correctly`, async () => {
        const { oracle, forced } = await oracleAggregator.assignedOracle(TOKEN_A, TOKEN_B);
        expect(oracle).to.equal(oracle2.address);
        expect(forced).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleAssigned').withArgs(TOKEN_A, TOKEN_B, oracle2.address);
      });
      then('oracle is configured', async () => {
        expect(oracle2.addOrModifySupportForPair).to.be.calledWith(TOKEN_A, TOKEN_B, BYTES);
      });
    });
    shouldBeExecutableOnlyByRole({
      contract: () => oracleAggregator,
      funcAndSignature: 'forceOracle',
      params: [TOKEN_A, TOKEN_B, TOKEN_A, BYTES],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('_addOrModifySupportForPair', () => {
    when('oracle 1 can support the given pair', () => {
      let tx: TransactionResponse;
      given(async () => {
        oracle1.canSupportPair.returns(true);
        tx = await oracleAggregator.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      then('oracle 1 is called', async () => {
        expect(oracle1.addOrModifySupportForPair).to.be.calledWith(TOKEN_A, TOKEN_B, BYTES);
      });
      then('oracle 2 is not called', async () => {
        expect(oracle2.addOrModifySupportForPair).to.not.have.been.called;
      });
      then('now oracle 1 will be used', async () => {
        const { oracle, forced } = await oracleAggregator.assignedOracle(TOKEN_A, TOKEN_B);
        expect(oracle).to.equal(oracle1.address);
        expect(forced).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleAssigned').withArgs(TOKEN_A, TOKEN_B, oracle1.address);
      });
    });
    when('oracle 1 cant support the given pair', () => {
      let tx: TransactionResponse;
      given(async () => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(true);
        tx = await oracleAggregator.internalAddOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      then('oracle 2 is called', async () => {
        expect(oracle2.addOrModifySupportForPair).to.be.calledWith(TOKEN_A, TOKEN_B, BYTES);
      });
      then('oracle 1 is not called', async () => {
        expect(oracle1.addOrModifySupportForPair).to.not.have.been.called;
      });
      then('now oracle 2 will be used', async () => {
        const { oracle, forced } = await oracleAggregator.assignedOracle(TOKEN_A, TOKEN_B);
        expect(oracle).to.equal(oracle2.address);
        expect(forced).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleAssigned').withArgs(TOKEN_A, TOKEN_B, oracle2.address);
      });
    });
    when('no oracle can support the pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(false);
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator,
          func: 'internalAddOrModifySupportForPair',
          args: [TOKEN_A, TOKEN_B, BYTES],
          message: `PairCannotBeSupported("${TOKEN_A}", "${TOKEN_B}")`,
        });
      });
    });
  });

  describe('setAvailableOracles', () => {
    let newOracle1: FakeContract<BaseOracle>, newOracle2: FakeContract<BaseOracle>, newOracle3: FakeContract<BaseOracle>;
    given(async () => {
      newOracle1 = await deployFakeOracle();
      newOracle2 = await deployFakeOracle();
      newOracle3 = await deployFakeOracle();
    });
    when('one of the given addresses it not an oracle', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator.connect(admin),
          func: 'setAvailableOracles',
          args: [[constants.AddressZero]],
          message: `AddressIsNotOracle`,
        });
      });
    });
    setOraclesTest({
      when: 'the number of oracles stay the same',
      newOracles: () => [newOracle1.address, newOracle2.address],
    });
    setOraclesTest({
      when: 'the number of oracles increased',
      newOracles: () => [newOracle1.address, newOracle2.address, newOracle3.address],
    });
    setOraclesTest({
      when: 'the number of oracles is reduced',
      newOracles: () => [newOracle1.address],
    });
    setOraclesTest({
      when: 'changing order of current added oracles',
      newOracles: () => [oracle2.address, oracle1.address],
    });
    function setOraclesTest({ when: title, newOracles }: { when: string; newOracles: () => string[] }) {
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          tx = await oracleAggregator.connect(admin).setAvailableOracles(newOracles());
        });
        then('oracles are set correctly', async () => {
          const available = await oracleAggregator.availableOracles();
          expect(available).to.eql(newOracles());
        });
        then('event is emitted', async () => {
          await expect(tx).to.emit(oracleAggregator, 'OracleListUpdated').withArgs(newOracles());
        });
      });
    }

    shouldBeExecutableOnlyByRole({
      contract: () => oracleAggregator,
      funcAndSignature: 'setAvailableOracles',
      params: [[]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('supportsInterface', () => {
    behaviours.shouldSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'IERC165',
      interface: IERC165__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'Multicall',
      interface: Multicall__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'ITokenPriceOracle',
      interface: ITokenPriceOracle__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'IOracleAggregator',
      interface: {
        actual: IOracleAggregator__factory.createInterface(),
        inheritedFrom: [ITokenPriceOracle__factory.createInterface()],
      },
    });
    behaviours.shouldSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'IAccessControl',
      interface: IAccessControl__factory.createInterface(),
    });
    behaviours.shouldNotSupportInterface({
      contract: () => oracleAggregator,
      interfaceName: 'IERC20',
      interface: IERC20__factory.createInterface(),
    });
  });
  async function deployFakeOracle() {
    const ERC_165_INTERFACE_ID = getInterfaceId(IERC165__factory.createInterface());
    const PRICE_ORACLE_INTERFACE_ID = getInterfaceId(ITokenPriceOracle__factory.createInterface());
    const oracle = await smock.fake<BaseOracle>('BaseOracle');
    oracle.supportsInterface.returns(
      ({ _interfaceId }: { _interfaceId: string }) => _interfaceId === ERC_165_INTERFACE_ID || _interfaceId === PRICE_ORACLE_INTERFACE_ID
    );
    return oracle;
  }
});
