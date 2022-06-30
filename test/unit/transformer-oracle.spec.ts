import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { then, when } from '@utils/bdd';
import { ITransformerRegistry, ITokenPriceOracle, TransformerOracle, TransformerOracle__factory } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('TransformerOracle', () => {
  let transformerOracleFactory: TransformerOracle__factory;
  let transformerOracle: TransformerOracle;
  let underlyingOracle: FakeContract<ITokenPriceOracle>;
  let registry: FakeContract<ITransformerRegistry>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    transformerOracleFactory = await ethers.getContractFactory('solidity/contracts/TransformerOracle.sol:TransformerOracle');
    registry = await smock.fake<ITransformerRegistry>('ITokenPriceOracle');
    underlyingOracle = await smock.fake<ITokenPriceOracle>('ITokenPriceOracle');
    transformerOracle = await transformerOracleFactory.deploy(registry.address, underlyingOracle.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('registry is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: transformerOracleFactory,
          args: [constants.AddressZero, underlyingOracle.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('underlying oracle is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: transformerOracleFactory,
          args: [registry.address, constants.AddressZero],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('registry is set correctly', async () => {
        const returnedRegistry = await transformerOracle.REGISTRY();
        expect(returnedRegistry).to.equal(registry.address);
      });
      then('registry is set correctly', async () => {
        const returnedOracle = await transformerOracle.UNDERLYING_ORACLE();
        expect(returnedOracle).to.equal(underlyingOracle.address);
      });
    });
  });
});
