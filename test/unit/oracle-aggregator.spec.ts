import { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleAggregator, OracleAggregator__factory, IPriceOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { shouldBeExecutableOnlyByRole } from '@utils/behaviours';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregatorFactory: OracleAggregator__factory;
  let oracleAggregator: OracleAggregator;
  let superAdminRole: string, adminRole: string;
  let oracle1: FakeContract<IPriceOracle>, oracle2: FakeContract<IPriceOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracleAggregatorFactory = await ethers.getContractFactory('solidity/contracts/OracleAggregator.sol:OracleAggregator');
    oracle1 = await smock.fake('IPriceOracle');
    oracle2 = await smock.fake('IPriceOracle');
    oracleAggregator = await oracleAggregatorFactory.deploy([oracle1.address, oracle2.address], superAdmin.address, [admin.address]);
    superAdminRole = await oracleAggregator.SUPER_ADMIN_ROLE();
    adminRole = await oracleAggregator.ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
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
    when('both oracle support a pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(true);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('setAvailableOracles', () => {
    const NEW_ORACLE_1 = '0x0000000000000000000000000000000000000001';
    const NEW_ORACLE_2 = '0x0000000000000000000000000000000000000002';
    const NEW_ORACLE_3 = '0x0000000000000000000000000000000000000003';
    setOraclesTest({
      when: 'the number of oracles stay the same',
      newOracles: [NEW_ORACLE_1, NEW_ORACLE_2],
    });
    setOraclesTest({
      when: 'the number of oracles increased',
      newOracles: [NEW_ORACLE_1, NEW_ORACLE_2, NEW_ORACLE_3],
    });
    setOraclesTest({
      when: 'the number of oracles is reduced',
      newOracles: [NEW_ORACLE_1],
    });
    function setOraclesTest({ when: title, newOracles }: { when: string; newOracles: string[] }) {
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          tx = await oracleAggregator.connect(admin).setAvailableOracles(newOracles);
        });
        then('oracles are set correctly', async () => {
          const available = await oracleAggregator.availableOracles();
          expect(available).to.eql(newOracles);
        });
        then('event is emitted', async () => {
          await expect(tx).to.emit(oracleAggregator, 'OracleListUpdated').withArgs(newOracles);
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
});
