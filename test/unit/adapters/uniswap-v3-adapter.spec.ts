import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { UniswapV3Adapter, UniswapV3Adapter__factory, IStaticOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('UniswapV3Adapter', () => {
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let adapterFactory: UniswapV3Adapter__factory;
  let adapter: UniswapV3Adapter;
  let superAdminRole: string, adminRole: string;
  let oracle: FakeContract<IStaticOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracle = await smock.fake('IStaticOracle');
    adapterFactory = await ethers.getContractFactory('solidity/contracts/adapters/UniswapV3Adapter.sol:UniswapV3Adapter');
    adapter = await adapterFactory.deploy({ uniswapV3Oracle: oracle.address, superAdmin: superAdmin.address, initialAdmins: [admin.address] });
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
          args: [{ uniswapV3Oracle: oracle.address, superAdmin: constants.AddressZero, initialAdmins: [admin.address] }],
          message: 'ZeroAddress',
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
    });
  });
});
