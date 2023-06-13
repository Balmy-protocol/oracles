import { expect } from 'chai';
import { ethers } from 'hardhat';
import { given, then, when } from '@utils/bdd';
import { API3ChainlinkAdapter__factory, API3ChainlinkAdapterFactory__factory, API3ChainlinkAdapterFactory } from '@typechained';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';
import { snapshot } from '@utils/evm';

describe('API3ChainlinkAdapterFactory', () => {
  const PROXY = '0x0000000000000000000000000000000000000001';
  const DESCRIPTION = 'TOKEN/USD';

  let factory: API3ChainlinkAdapterFactory;
  let snapshotId: string;

  before(async () => {
    const factoryFactory: API3ChainlinkAdapterFactory__factory = await ethers.getContractFactory('API3ChainlinkAdapterFactory');
    factory = await factoryFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('createAdapter', () => {
    when('adapter is created', () => {
      let expectedAddress: string;
      let tx: TransactionResponse;
      given(async () => {
        expectedAddress = await factory.computeAdapterAddress(PROXY, DESCRIPTION);
        tx = await factory.createAdapter(PROXY, DESCRIPTION);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(factory, 'AdapterCreated').withArgs(expectedAddress);
      });
      then('contract was deployed correctly', async () => {
        const adapter = API3ChainlinkAdapter__factory.connect(expectedAddress, ethers.provider);
        expect(await adapter.API3_PROXY()).to.equal(PROXY);
        expect(await adapter.description()).to.equal(DESCRIPTION);
      });
    });
    when('adapter is created twice', () => {
      given(async () => {
        await factory.createAdapter(PROXY, DESCRIPTION);
      });
      then('the second time reverts', async () => {
        const tx = factory.createAdapter(PROXY, DESCRIPTION);
        await expect(tx).to.have.reverted;
      });
    });
  });
});
