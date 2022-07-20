import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours } from '@utils';
import { then, when } from '@utils/bdd';
import { IdentityOracle, IdentityOracle__factory } from '@typechained';
import { snapshot } from '@utils/evm';

describe('IdentityOracle', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes
  let oracle: IdentityOracle;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const factory = await ethers.getContractFactory<IdentityOracle__factory>('solidity/contracts/IdentityOracle.sol:IdentityOracle');
    oracle = await factory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('canSupportPair', () => {
    when('asking for the same tokens', () => {
      then('pair can be supported', async () => {
        expect(await oracle.canSupportPair(TOKEN_A, TOKEN_A)).to.be.true;
      });
    });
    when('asking for different tokens', () => {
      then('pair cannot be supported', async () => {
        expect(await oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
  });

  describe('isPairAlreadySupported', () => {
    when('asking for the same tokens', () => {
      then('pair is already supported', async () => {
        expect(await oracle.isPairAlreadySupported(TOKEN_A, TOKEN_A)).to.be.true;
      });
    });
    when('asking for different tokens', () => {
      then('pair is not already supported', async () => {
        expect(await oracle.isPairAlreadySupported(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
  });

  describe('quote', () => {
    when('quoting for different tokens', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracle,
          func: 'quote',
          args: [TOKEN_A, 1000, TOKEN_B, BYTES],
          message: `PairNotSupportedYet`,
        });
      });
    });
    when('quoting for the same tokens', () => {
      then('result is the same as amount in', async () => {
        const amountOut = await oracle.quote(TOKEN_A, 1000, TOKEN_A, BYTES);
        expect(amountOut).to.equal(1000);
      });
    });
  });

  addSupportForPairTest('addOrModifySupportForPair');

  addSupportForPairTest('addSupportForPairIfNeeded');

  function addSupportForPairTest(method: 'addOrModifySupportForPair' | 'addSupportForPairIfNeeded') {
    describe(method, () => {
      when('trying to support different tokens', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: oracle,
            func: method,
            args: [TOKEN_A, TOKEN_B, BYTES],
            message: `PairCannotBeSupported`,
          });
        });
      });
      when('trying to support a pair with the same tokens', () => {
        then('tx does not fail', async () => {
          await oracle[method](TOKEN_A, TOKEN_A, BYTES);
        });
      });
    });
  }
});
