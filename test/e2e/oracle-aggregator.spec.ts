import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleAggregatorMock, OracleAggregatorMock__factory, BaseOracle, ERC165__factory, ITokenPriceOracle__factory } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { BigNumber } from 'ethers';
import { getInterfaceId } from '@utils/erc165';

chai.use(smock.matchers);

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const TOKEN_C = '0x0000000000000000000000000000000000000003';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregator: OracleAggregatorMock;
  let superAdminRole: string, adminRole: string;
  let oracle1: FakeContract<BaseOracle>, oracle2: FakeContract<BaseOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    const oracleAggregatorFactory: OracleAggregatorMock__factory = await ethers.getContractFactory(
      'solidity/contracts/OracleAggregator.sol:OracleAggregator'
    );
    oracle1 = await deployFakeOracle();
    oracle2 = await deployFakeOracle();
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
          await oracleAggregator.connect(admin).addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
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
        oracle1.quote.returns(QUOTE_ORACLE_1);
        oracle2.quote.returns(QUOTE_ORACLE_2);
        await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_B, oracle1.address);
        await oracleAggregator.connect(admin).forceOracle(TOKEN_A, TOKEN_C, oracle2.address);

        const { data: quote1Data } = await oracleAggregator.populateTransaction.quote(TOKEN_A, 1, TOKEN_B, BYTES);
        const { data: quote2Data } = await oracleAggregator.populateTransaction.quote(TOKEN_A, 1, TOKEN_C, BYTES);
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
  async function deployFakeOracle() {
    const ERC_165_INTERFACE_ID = getInterfaceId(ERC165__factory.createInterface());
    const PRICE_ORACLE_INTERFACE_ID = getInterfaceId(ITokenPriceOracle__factory.createInterface());
    const oracle = await smock.fake<BaseOracle>('BaseOracle');
    oracle.supportsInterface.returns(
      ({ _interfaceId }: { _interfaceId: string }) => _interfaceId === ERC_165_INTERFACE_ID || _interfaceId === PRICE_ORACLE_INTERFACE_ID
    );
    return oracle;
  }
});
