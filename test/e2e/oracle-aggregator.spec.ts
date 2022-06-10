import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleAggregatorMock, OracleAggregatorMock__factory, IPriceOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregator: OracleAggregatorMock;
  let superAdminRole: string, adminRole: string;
  let oracle1: FakeContract<IPriceOracle>, oracle2: FakeContract<IPriceOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    const oracleAggregatorFactory: OracleAggregatorMock__factory = await ethers.getContractFactory(
      'solidity/contracts/OracleAggregator.sol:OracleAggregator'
    );
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

  describe('force and update', () => {
    when('an oracle is forced', () => {
      given(async () => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(true);
        await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_B, oracle2.address);
      });
      describe('and then an admin updates the support', () => {
        given(async () => {
          await oracleAggregator.connect(admin)['addOrModifySupportForPair(address,address)'](TOKEN_A, TOKEN_B);
        });
        then('a oracle that takes precedence will be assigned', async () => {
          const { oracle, forced } = await oracleAggregator.assignedOracle(TOKEN_A, TOKEN_B);
          expect(oracle).to.equal(oracle1.address);
          expect(forced).to.be.false;
        });
      });
    });
  });
});
