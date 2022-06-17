import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleAggregatorMock, OracleAggregatorMock__factory, ITokenPriceOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { BigNumber } from 'ethers';

chai.use(smock.matchers);

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const TOKEN_C = '0x0000000000000000000000000000000000000003';
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregator: OracleAggregatorMock;
  let superAdminRole: string, adminRole: string;
  let oracle1: FakeContract<ITokenPriceOracle>, oracle2: FakeContract<ITokenPriceOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    const oracleAggregatorFactory: OracleAggregatorMock__factory = await ethers.getContractFactory(
      'solidity/contracts/OracleAggregator.sol:OracleAggregator'
    );
    oracle1 = await smock.fake('ITokenPriceOracle');
    oracle2 = await smock.fake('ITokenPriceOracle');
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

  describe('multicall', () => {
    const QUOTE_ORACLE_1 = BigNumber.from(10);
    const QUOTE_ORACLE_2 = BigNumber.from(20);
    when('executing multiple quotes', () => {
      let result1: string, result2: string;
      given(async () => {
        oracle1['quote(address,uint256,address,bytes)'].returns(QUOTE_ORACLE_1);
        oracle2['quote(address,uint256,address,bytes)'].returns(QUOTE_ORACLE_2);
        await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_B, oracle1.address);
        await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_C, oracle2.address);

        const { data: quote1Data } = await oracleAggregator.populateTransaction['quote(address,uint256,address)'](TOKEN_A, 1, TOKEN_B);
        const { data: quote2Data } = await oracleAggregator.populateTransaction['quote(address,uint256,address)'](TOKEN_A, 1, TOKEN_C);
        [result1, result2] = await oracleAggregator.callStatic.multicall([quote1Data!, quote2Data!]);
      });
      then('first quote was returned correctly', async () => {
        expect(BigNumber.from(result1)).to.equal(QUOTE_ORACLE_1);
      });
      then('second quote was returned correctly', async () => {
        expect(BigNumber.from(result2)).to.equal(QUOTE_ORACLE_2);
      });
    });
  });
});
