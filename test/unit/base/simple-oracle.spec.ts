import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SimpleOracleMock, SimpleOracleMock__factory, ITokenPriceOracle } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { shouldBeExecutableOnlyByRole } from '@utils/behaviours';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';

chai.use(smock.matchers);

describe('SimpleOracle', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes
  let oracle: SimpleOracleMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const factory: SimpleOracleMock__factory = await ethers.getContractFactory('solidity/contracts/test/base/SimpleOracle.sol:SimpleOracleMock');
    oracle = await factory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('addOrModifySupportForPair', () => {
    when('function is called', () => {
      given(async () => {
        await oracle.addOrModifySupportForPair(TOKEN_A, TOKEN_B, BYTES);
      });
      then('internal version is called directly', async () => {
        const lastCall = await oracle.lastCall();
        expect(lastCall.tokenA).to.equal(TOKEN_A);
        expect(lastCall.tokenB).to.equal(TOKEN_B);
        expect(lastCall.data).to.equal(BYTES);
      });
    });
  });

  describe('addSupportForPairIfNeeded', () => {
    when('pair is already supported', () => {
      given(async () => {
        await oracle.setPairAlreadySupported(TOKEN_A, TOKEN_B);
        await oracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B, BYTES);
      });
      then('internal version is not called', async () => {
        const lastCall = await oracle.lastCall();
        expect(lastCall.tokenA).to.equal(constants.AddressZero);
      });
    });
    when('pair is not supported yet', () => {
      given(async () => {
        await oracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B, BYTES);
      });
      then('internal version is called directly', async () => {
        const lastCall = await oracle.lastCall();
        expect(lastCall.tokenA).to.equal(TOKEN_A);
        expect(lastCall.tokenB).to.equal(TOKEN_B);
        expect(lastCall.data).to.equal(BYTES);
      });
    });
  });
});
