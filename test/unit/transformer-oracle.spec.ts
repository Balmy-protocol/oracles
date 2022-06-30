import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import {
  ITransformerRegistry,
  ITokenPriceOracle,
  TransformerOracleMock,
  TransformerOracleMock__factory,
  IERC165__factory,
  Multicall__factory,
  ITokenPriceOracle__factory,
  ITransformerOracle__factory,
  IERC20__factory,
  ITransformer,
} from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('TransformerOracle', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const UNDERLYING_TOKEN_A = '0x0000000000000000000000000000000000000003';
  const UNDERLYING_TOKEN_B = '0x0000000000000000000000000000000000000004';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

  let transformerOracleFactory: TransformerOracleMock__factory;
  let transformerOracle: TransformerOracleMock;
  let underlyingOracle: FakeContract<ITokenPriceOracle>;
  let registry: FakeContract<ITransformerRegistry>;
  let transformerA: FakeContract<ITransformer>, transformerB: FakeContract<ITransformer>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    transformerOracleFactory = await ethers.getContractFactory('solidity/contracts/test/TransformerOracle.sol:TransformerOracleMock');
    registry = await smock.fake<ITransformerRegistry>('ITransformerRegistry');
    underlyingOracle = await smock.fake<ITokenPriceOracle>('ITokenPriceOracle');
    transformerA = await smock.fake<ITransformer>('ITransformer');
    transformerB = await smock.fake<ITransformer>('ITransformer');
    transformerOracle = await transformerOracleFactory.deploy(registry.address, underlyingOracle.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    underlyingOracle.canSupportPair.reset();
    underlyingOracle.isPairAlreadySupported.reset();
    underlyingOracle.addOrModifySupportForPair.reset();
    underlyingOracle.addSupportForPairIfNeeded.reset();
    registry.transformers.reset();
    transformerA.getUnderlying.reset();
    transformerB.getUnderlying.reset();
    transformerA.getUnderlying.returns([UNDERLYING_TOKEN_A]);
    transformerB.getUnderlying.returns([UNDERLYING_TOKEN_B]);
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

  describe('mapPairToUnderlying', () => {
    mapPairToUnderlyingTest({
      when: 'both tokens have underlying',
      underlyingTokenA: true,
      underlyingTokenB: true,
    });

    mapPairToUnderlyingTest({
      when: 'only tokenA has underlying',
      underlyingTokenA: true,
      underlyingTokenB: false,
    });

    mapPairToUnderlyingTest({
      when: 'only tokenB has underlying',
      underlyingTokenA: false,
      underlyingTokenB: true,
    });

    mapPairToUnderlyingTest({
      when: 'neither of the tokens have underlying',
      underlyingTokenA: false,
      underlyingTokenB: false,
    });

    function mapPairToUnderlyingTest({
      when: title,
      underlyingTokenA: tokenAHasUnderlying,
      underlyingTokenB: tokenBHasUnderlying,
    }: {
      when: string;
      underlyingTokenA: boolean;
      underlyingTokenB: boolean;
    }) {
      when(title, () => {
        let underlyingTokenA: string, underlyingTokenB: string;
        given(async () => {
          const transformerTokenA = tokenAHasUnderlying ? transformerA.address : constants.AddressZero;
          const transformerTokenB = tokenBHasUnderlying ? transformerB.address : constants.AddressZero;
          registry.transformers.returns([transformerTokenA, transformerTokenB]);
          [underlyingTokenA, underlyingTokenB] = await transformerOracle.mapPairToUnderlying(TOKEN_A, TOKEN_B);
        });
        then('registry was called correctly', () => {
          expect(registry.transformers).to.have.been.calledOnceWith([TOKEN_A, TOKEN_B]);
        });
        if (tokenAHasUnderlying) {
          then('underlying tokenA is returned correctly', () => {
            expect(underlyingTokenA).to.equal(UNDERLYING_TOKEN_A);
          });
          then('transformer for tokenA was called correctly', () => {
            expect(transformerA.getUnderlying).to.have.been.calledOnceWith(TOKEN_A);
          });
        } else {
          then('underlying for tokenA is actually tokenA', () => {
            expect(underlyingTokenA).to.equal(TOKEN_A);
          });
          then('transformer for tokenA was not called', () => {
            expect(transformerA.getUnderlying).to.not.have.been.called;
          });
        }
        if (tokenBHasUnderlying) {
          then('underlying tokenB is returned correctly', () => {
            expect(underlyingTokenB).to.equal(UNDERLYING_TOKEN_B);
          });
          then('transformer for tokenB was called correctly', () => {
            expect(transformerB.getUnderlying).to.have.been.calledOnceWith(TOKEN_B);
          });
        } else {
          then('underlying for tokenB is actually tokenB', () => {
            expect(underlyingTokenB).to.equal(TOKEN_B);
          });
          then('transformer for tokenB was not called', () => {
            expect(transformerB.getUnderlying).to.not.have.been.called;
          });
        }
      });
    }
  });

  executeRedirectTest({
    func: 'canSupportPair',
    params: (mappedTokenA, mappedTokenB) => [mappedTokenA, mappedTokenB],
    returns: true,
  });

  executeRedirectTest({
    func: 'isPairAlreadySupported',
    params: (mappedTokenA, mappedTokenB) => [mappedTokenA, mappedTokenB],
    returns: true,
  });

  executeRedirectTest({
    func: 'addOrModifySupportForPair',
    params: (mappedTokenA, mappedTokenB) => [mappedTokenA, mappedTokenB, BYTES],
  });

  executeRedirectTest({
    func: 'addSupportForPairIfNeeded',
    params: (mappedTokenA, mappedTokenB) => [mappedTokenA, mappedTokenB, BYTES],
  });

  describe('supportsInterface', () => {
    behaviours.shouldSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'IERC165',
      interface: IERC165__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'Multicall',
      interface: Multicall__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'ITokenPriceOracle',
      interface: ITokenPriceOracle__factory.createInterface(),
    });
    behaviours.shouldSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'ITransformerOracle',
      interface: {
        actual: ITransformerOracle__factory.createInterface(),
        inheritedFrom: [ITokenPriceOracle__factory.createInterface()],
      },
    });
    behaviours.shouldNotSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'IERC20',
      interface: IERC20__factory.createInterface(),
    });
  });

  function executeRedirectTest<T extends keyof ITokenPriceOracle['functions']>({
    returns,
    func,
    params,
  }: {
    returns?: any;
    params: (mappedTokenA: string, mappedTokenB: string) => Parameters<ITokenPriceOracle['functions'][T]>;
    func: T;
  }) {
    describe(func, () => {
      executeTest({
        when: 'mapped are tokenA and tokenB',
        mappedA: TOKEN_A,
        mappedB: TOKEN_B,
      });
      executeTest({
        when: 'mapped are tokenA and underlyingTokenB',
        mappedA: TOKEN_A,
        mappedB: UNDERLYING_TOKEN_B,
      });
      executeTest({
        when: 'mapped are underlyingTokenA and tokenB',
        mappedA: UNDERLYING_TOKEN_A,
        mappedB: TOKEN_B,
      });
      executeTest({
        when: 'mapped are underlyingTokenA and underlyingTokenB',
        mappedA: UNDERLYING_TOKEN_A,
        mappedB: UNDERLYING_TOKEN_B,
      });
    });
    function executeTest({ when: title, mappedA, mappedB }: { when: string; mappedA: string; mappedB: string }) {
      when(title, () => {
        let returned: any;
        given(async () => {
          await transformerOracle.setUnderlying(TOKEN_A, TOKEN_B, mappedA, mappedB);
          if (returns) {
            underlyingOracle[func].returns(returns);
          }
          returned = await (transformerOracle[func] as any)(...params(TOKEN_A, TOKEN_B));
        });
        then('oracle is called with the correct parameters', () => {
          expect(underlyingOracle[func]).to.have.been.calledOnceWith(...params(mappedA, mappedB));
        });
        if (returns) {
          then('return value is what the oracle returned', () => {
            expect(returned).to.equal(returns);
          });
        }
      });
    }
  }
});
