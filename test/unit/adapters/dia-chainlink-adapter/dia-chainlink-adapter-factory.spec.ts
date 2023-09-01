import { expect } from 'chai';
import { ethers } from 'hardhat';
import { given, then, when } from '@utils/bdd';
import { DIAChainlinkAdapter__factory, DIAChainlinkAdapterFactory__factory, DIAChainlinkAdapterFactory } from '@typechained';
import { TransactionResponse } from 'ethers/node_modules/@ethersproject/providers';
import { snapshot } from '@utils/evm';

describe('DIAChainlinkAdapterFactory', () => {
  const ORACLE_ADDRESS = '0xa93546947f3015c986695750b8bbEa8e26D65856';
  const DECIMALS = 8;
  const DESCRIPTION = 'ETH/USD';

  let factory: DIAChainlinkAdapterFactory;
  let snapshotId: string;

  before(async () => {
    const factoryFactory: DIAChainlinkAdapterFactory__factory = await ethers.getContractFactory('DIAChainlinkAdapterFactory');
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
        expectedAddress = await factory.computeAdapterAddress(ORACLE_ADDRESS, DECIMALS, DESCRIPTION);
        tx = await factory.createAdapter(ORACLE_ADDRESS, DECIMALS, DESCRIPTION);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(factory, 'AdapterCreated').withArgs(expectedAddress);
      });
      then('contract was deployed correctly', async () => {
        const adapter = DIAChainlinkAdapter__factory.connect(expectedAddress, ethers.provider);
        expect(await adapter.DIA_ORACLE()).to.equal(ORACLE_ADDRESS);
        expect(await adapter.decimals()).to.equal(DECIMALS);
        expect(await adapter.description()).to.equal(DESCRIPTION);
      });
    });
    when('adapter is created twice', () => {
      given(async () => {
        await factory.createAdapter(ORACLE_ADDRESS, DECIMALS, DESCRIPTION);
      });
      then('the second time reverts', async () => {
        const tx = factory.createAdapter(ORACLE_ADDRESS, DECIMALS, DESCRIPTION);
        await expect(tx).to.have.reverted;
      });
    });
  });
});
