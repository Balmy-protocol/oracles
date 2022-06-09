import { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleAggregator, OracleAggregator__factory } from '@typechained';
import { snapshot } from '@utils/evm';

describe('OracleAggregator', () => {
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let oracleAggregatorFactory: OracleAggregator__factory;
  let oracleAggregator: OracleAggregator;
  let superAdminRole: string, adminRole: string;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    oracleAggregatorFactory = await ethers.getContractFactory('solidity/contracts/OracleAggregator.sol:OracleAggregator');
    oracleAggregator = await oracleAggregatorFactory.deploy(superAdmin.address, [admin.address]);
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
          args: [constants.AddressZero, []],
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
    });
  });
});
