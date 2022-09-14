import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants } from 'ethers';
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
  IAccessControl__factory,
} from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TransactionResponse } from '@ethersproject/providers';

chai.use(smock.matchers);

describe('TransformerOracle', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const UNDERLYING_TOKEN_A = '0x0000000000000000000000000000000000000003';
  const UNDERLYING_TOKEN_B = '0x0000000000000000000000000000000000000004';
  const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let transformerOracleFactory: TransformerOracleMock__factory;
  let transformerOracle: TransformerOracleMock;
  let underlyingOracle: FakeContract<ITokenPriceOracle>;
  let registry: FakeContract<ITransformerRegistry>;
  let transformerA: FakeContract<ITransformer>, transformerB: FakeContract<ITransformer>;
  let superAdminRole: string, adminRole: string;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    transformerOracleFactory = await ethers.getContractFactory('solidity/contracts/test/TransformerOracle.sol:TransformerOracleMock');
    registry = await smock.fake<ITransformerRegistry>('ITransformerRegistry');
    underlyingOracle = await smock.fake<ITokenPriceOracle>('ITokenPriceOracle');
    transformerA = await smock.fake<ITransformer>('ITransformer');
    transformerB = await smock.fake<ITransformer>('ITransformer');
    transformerOracle = await transformerOracleFactory.deploy(registry.address, underlyingOracle.address, superAdmin.address, [admin.address]);
    superAdminRole = await transformerOracle.SUPER_ADMIN_ROLE();
    adminRole = await transformerOracle.ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    underlyingOracle.canSupportPair.reset();
    underlyingOracle.isPairAlreadySupported.reset();
    underlyingOracle.addOrModifySupportForPair.reset();
    underlyingOracle.addSupportForPairIfNeeded.reset();
    underlyingOracle.quote.reset();
    registry.transformers.reset();
    transformerA.getUnderlying.reset();
    transformerB.getUnderlying.reset();
    transformerA.calculateTransformToUnderlying.reset();
    transformerB.calculateTransformToDependent.reset();
    transformerA.getUnderlying.returns([UNDERLYING_TOKEN_A]);
    transformerB.getUnderlying.returns([UNDERLYING_TOKEN_B]);
  });

  describe('constructor', () => {
    when('registry is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: transformerOracleFactory,
          args: [constants.AddressZero, underlyingOracle.address, superAdmin.address, [admin.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('underlying oracle is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: transformerOracleFactory,
          args: [registry.address, constants.AddressZero, superAdmin.address, [admin.address]],
          message: 'ZeroAddress',
        });
      });
      when('super admin is zero address', () => {
        then('tx is reverted with reason error', async () => {
          await behaviours.deployShouldRevertWithMessage({
            contract: transformerOracleFactory,
            args: [registry.address, underlyingOracle.address, constants.AddressZero, [admin.address]],
            message: 'ZeroAddress',
          });
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
      then('super admin is set correctly', async () => {
        const hasRole = await transformerOracle.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await transformerOracle.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as super admin role', async () => {
        const admin = await transformerOracle.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin role', async () => {
        const admin = await transformerOracle.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
      });
    });
  });

  describe('getMappingForPair', () => {
    getMappingForPairTest({
      when: 'both tokens have underlying',
      underlyingTokenA: true,
      underlyingTokenB: true,
    });

    getMappingForPairTest({
      when: 'only tokenA has underlying',
      underlyingTokenA: true,
      underlyingTokenB: false,
    });

    getMappingForPairTest({
      when: 'only tokenB has underlying',
      underlyingTokenA: false,
      underlyingTokenB: true,
    });

    getMappingForPairTest({
      when: 'neither of the tokens have underlying',
      underlyingTokenA: false,
      underlyingTokenB: false,
    });

    function getMappingForPairTest({
      when: title,
      underlyingTokenA: tokenAHasUnderlying,
      underlyingTokenB: tokenBHasUnderlying,
    }: {
      when: string;
      underlyingTokenA: boolean;
      underlyingTokenB: boolean;
    }) {
      when(title, () => {
        let mappedTokenA: string, mappedTokenB: string;
        given(async () => {
          const transformerTokenA = tokenAHasUnderlying ? transformerA.address : constants.AddressZero;
          const transformerTokenB = tokenBHasUnderlying ? transformerB.address : constants.AddressZero;
          await transformerOracle.setTransformersForPair(TOKEN_A, TOKEN_B, transformerTokenA, transformerTokenB);
          [mappedTokenA, mappedTokenB] = await transformerOracle.getMappingForPair(TOKEN_A, TOKEN_B);
        });
        if (tokenAHasUnderlying) {
          then('underlying tokenA is returned correctly', () => {
            expect(mappedTokenA).to.equal(UNDERLYING_TOKEN_A);
          });
          then('transformer for tokenA was called correctly', () => {
            expect(transformerA.getUnderlying).to.have.been.calledOnceWith(TOKEN_A);
          });
        } else {
          then('mapped for tokenA is actually tokenA', () => {
            expect(mappedTokenA).to.equal(TOKEN_A);
          });
          then('transformer for tokenA was not called', () => {
            expect(transformerA.getUnderlying).to.not.have.been.called;
          });
        }
        if (tokenBHasUnderlying) {
          then('underlying tokenB is returned correctly', () => {
            expect(mappedTokenB).to.equal(UNDERLYING_TOKEN_B);
          });
          then('transformer for tokenB was called correctly', () => {
            expect(transformerB.getUnderlying).to.have.been.calledOnceWith(TOKEN_B);
          });
        } else {
          then('mapped for tokenB is actually tokenB', () => {
            expect(mappedTokenB).to.equal(TOKEN_B);
          });
          then('transformer for tokenB was not called', () => {
            expect(transformerB.getUnderlying).to.not.have.been.called;
          });
        }
      });
    }
  });

  describe('avoidMappingToUnderlying', () => {
    when('token is set to avoid mapping', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await transformerOracle.connect(admin).avoidMappingToUnderlying([TOKEN_A]);
      });
      then('token will avoid mapping', async () => {
        const willAvoid = await transformerOracle.willAvoidMappingToUnderlying(TOKEN_A);
        expect(willAvoid).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(transformerOracle, 'DependentsWillAvoidMappingToUnderlying').withArgs([TOKEN_A]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => transformerOracle,
      funcAndSignature: 'avoidMappingToUnderlying',
      params: [[TOKEN_A]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('shouldMapToUnderlying', () => {
    when('token is set to map again', () => {
      let tx: TransactionResponse;
      given(async () => {
        await transformerOracle.connect(admin).avoidMappingToUnderlying([TOKEN_A]);
        tx = await transformerOracle.connect(admin).shouldMapToUnderlying([TOKEN_A]);
      });
      then('token will not avoid mapping', async () => {
        const willAvoid = await transformerOracle.willAvoidMappingToUnderlying(TOKEN_A);
        expect(willAvoid).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(transformerOracle, 'DependentsWillMapToUnderlying').withArgs([TOKEN_A]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => transformerOracle,
      funcAndSignature: 'shouldMapToUnderlying',
      params: [[TOKEN_A]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
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

  describe('quote', () => {
    const AMOUNT_IN = 1000000;
    given(async () => {
      // UNDERLYING_TOKEN_A = DEPENDENT_TOKEN_A * 2
      transformerA.calculateTransformToUnderlying.returns(({ amountDependent }: { amountDependent: BigNumber }) => [
        { underlying: UNDERLYING_TOKEN_A, amount: amountDependent.mul(2) },
      ]);

      // UNDERLYING_TOKEN_B = DEPENDENT_TOKEN_B * 5
      transformerB.calculateTransformToDependent.returns(({ underlying }: { underlying: { amount: BigNumber }[] }) =>
        underlying[0].amount.div(5)
      );

      // UNDERLYING_TOKEN_A = UNDERLYING_TOKEN_B * 10
      underlyingOracle.quote.returns(({ amountIn }: { amountIn: BigNumber }) => amountIn.div(10));

      // Set transformers
      await transformerOracle.setTransformersForPair(TOKEN_A, TOKEN_B, transformerA.address, transformerB.address);
      await transformerOracle.setTransformersForPair(TOKEN_A, UNDERLYING_TOKEN_B, transformerA.address, constants.AddressZero);
      await transformerOracle.setTransformersForPair(UNDERLYING_TOKEN_A, TOKEN_B, constants.AddressZero, transformerB.address);
      await transformerOracle.setTransformersForPair(UNDERLYING_TOKEN_A, UNDERLYING_TOKEN_B, constants.AddressZero, constants.AddressZero);
    });
    when('token in and token out have to be transformed', () => {
      let returnedQuote: BigNumber;
      given(async () => {
        returnedQuote = await transformerOracle.quote(TOKEN_A, AMOUNT_IN, TOKEN_B, BYTES);
      });
      then('transformer for token in was called correctly', () => {
        expect(transformerA.calculateTransformToUnderlying).to.have.been.calledOnceWith(TOKEN_A, AMOUNT_IN);
      });
      then('transformer for token out was called for underlyings correctly', () => {
        expect(transformerB.getUnderlying).to.have.been.calledOnceWith(TOKEN_B);
      });
      then('underlying oracle was called correctly', () => {
        // UNDERLYING_TOKEN_A = DEPENDENT_TOKEN_A * 2
        expect(underlyingOracle.quote).to.have.been.calledOnceWith(UNDERLYING_TOKEN_A, AMOUNT_IN * 2, UNDERLYING_TOKEN_B, BYTES);
      });
      then('transformer for token out was called to calculate transform to dependent correctly', () => {
        expect(transformerB.calculateTransformToDependent).to.have.been.calledOnce;
        const call = transformerB.calculateTransformToDependent.getCall(0);
        const [dependent, underlying]: [string, ITransformer.UnderlyingAmountStruct[]] = call.args as any;
        expect(dependent).to.equal(TOKEN_B);
        expect(underlying).to.have.lengthOf(1);
        expect(underlying[0].underlying).to.equal(UNDERLYING_TOKEN_B);
        /*
         UNDERLYING_TOKEN_B = UNDERLYING_TOKEN_A / 10
                            = DEPENDENT_TOKEN_A * 2 / 10
                            = DEPENDENT_TOKEN_A / 5
         */
        expect(underlying[0].amount).to.equal(AMOUNT_IN / 5);
      });
      then('returned quote is as expected', () => {
        /*
         DEPENDENT_TOKEN_B = UNDERLYING_TOKEN_B / 5
                           = UNDERLYING_TOKEN_A / 10 / 5
                           = DEPENDENT_TOKEN_A * 2 / 10 / 5
                           = DEPENDENT_TOKEN_A / 25
        */
        expect(returnedQuote).to.equal(AMOUNT_IN / 25);
      });
    });
    when('token in has to be transformed', () => {
      let returnedQuote: BigNumber;
      given(async () => {
        returnedQuote = await transformerOracle.quote(TOKEN_A, AMOUNT_IN, UNDERLYING_TOKEN_B, BYTES);
      });
      then('transformer for token in was called correctly', () => {
        expect(transformerA.calculateTransformToUnderlying).to.have.been.calledOnceWith(TOKEN_A, AMOUNT_IN);
      });
      then('transformer for token out was not called', () => {
        expect(transformerB.getUnderlying).to.not.have.been.called;
        expect(transformerB.calculateTransformToDependent).to.not.have.been.called;
      });
      then('underlying oracle was called correctly', () => {
        // UNDERLYING_TOKEN_A = DEPENDENT_TOKEN_A * 2
        expect(underlyingOracle.quote).to.have.been.calledOnceWith(UNDERLYING_TOKEN_A, AMOUNT_IN * 2, UNDERLYING_TOKEN_B, BYTES);
      });
      then('returned quote is as expected', () => {
        /* 
         UNDERLYING_TOKEN_B = UNDERLYING_TOKEN_A / 10 
                            = DEPENDENT_TOKEN_A * 2 / 10 
                            = DEPENDENT_TOKEN_A / 5
         */
        expect(returnedQuote).to.equal(AMOUNT_IN / 5);
      });
    });
    when('token out has be transformed', () => {
      let returnedQuote: BigNumber;
      given(async () => {
        returnedQuote = await transformerOracle.quote(UNDERLYING_TOKEN_A, AMOUNT_IN, TOKEN_B, BYTES);
      });
      then('transformer for token out was called for underlyings correctly', () => {
        expect(transformerB.getUnderlying).to.have.been.calledOnceWith(TOKEN_B);
      });
      then('underlying oracle was called correctly', () => {
        expect(underlyingOracle.quote).to.have.been.calledOnceWith(UNDERLYING_TOKEN_A, AMOUNT_IN, UNDERLYING_TOKEN_B, BYTES);
      });
      then('transformer for token in was not called', () => {
        expect(transformerA.getUnderlying).to.not.have.been.called;
        expect(transformerA.calculateTransformToUnderlying).to.not.have.been.called;
      });
      then('transformer for token out was called to calculate transform to dependent correctly', () => {
        expect(transformerB.calculateTransformToDependent).to.have.been.calledOnce;
        const call = transformerB.calculateTransformToDependent.getCall(0);
        const [dependent, underlying]: [string, ITransformer.UnderlyingAmountStruct[]] = call.args as any;
        expect(dependent).to.equal(TOKEN_B);
        expect(underlying).to.have.lengthOf(1);
        expect(underlying[0].underlying).to.equal(UNDERLYING_TOKEN_B);
        // UNDERLYING_TOKEN_B = UNDERLYING_TOKEN_A / 10
        expect(underlying[0].amount).to.equal(AMOUNT_IN / 10);
      });
      then('returned quote is as expected', () => {
        /* 
         DEPENDENT_TOKEN_B = UNDERLYING_TOKEN_B / 5
                           = UNDERLYING_TOKEN_A / 10 / 5
                           = UNDERLYING_TOKEN_A / 50
         */
        expect(returnedQuote).to.equal(AMOUNT_IN / 50);
      });
    });
    when('neither of the tokens has to be transformed', () => {
      let returnedQuote: BigNumber;
      given(async () => {
        returnedQuote = await transformerOracle.quote(UNDERLYING_TOKEN_A, AMOUNT_IN, UNDERLYING_TOKEN_B, BYTES);
      });
      then('transformer for token in was not called', () => {
        expect(transformerA.getUnderlying).to.not.have.been.called;
        expect(transformerA.calculateTransformToUnderlying).to.not.have.been.called;
      });
      then('transformer for token out was not called', () => {
        expect(transformerB.getUnderlying).to.not.have.been.called;
        expect(transformerB.calculateTransformToDependent).to.not.have.been.called;
      });
      then('underlying oracle was called correctly', () => {
        expect(underlyingOracle.quote).to.have.been.calledOnceWith(UNDERLYING_TOKEN_A, AMOUNT_IN, UNDERLYING_TOKEN_B, BYTES);
      });
      then('returned quote is as expected', () => {
        // UNDERLYING_TOKEN_B = UNDERLYING_TOKEN_A / 10
        expect(returnedQuote).to.equal(AMOUNT_IN / 10);
      });
    });
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
    behaviours.shouldSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'IAccessControl',
      interface: IAccessControl__factory.createInterface(),
    });
    behaviours.shouldNotSupportInterface({
      contract: () => transformerOracle,
      interfaceName: 'IERC20',
      interface: IERC20__factory.createInterface(),
    });
  });

  describe('_getTransformers', () => {
    given(() => {
      registry.transformers.returns(({ dependents }: { dependents: string[] }) =>
        dependents.map((dependent) => {
          switch (dependent) {
            case TOKEN_A:
              return UNDERLYING_TOKEN_A;
            case TOKEN_B:
              return UNDERLYING_TOKEN_B;
            default:
              throw new Error('WTF');
          }
        })
      );
    });
    when('tokenA and tokenB should not be mapped', () => {
      let transformers: string[];
      given(async () => {
        await transformerOracle.connect(admin).avoidMappingToUnderlying([TOKEN_A, TOKEN_B]);
        transformers = await transformerOracle.internalGetTransformers(TOKEN_A, TOKEN_B);
      });
      then('registry is called correctly', () => {
        expect(registry.transformers).to.have.been.calledOnceWith([TOKEN_A, TOKEN_B]);
      });
      then('zero addresses are returned', () => {
        expect(transformers).to.eql([constants.AddressZero, constants.AddressZero]);
      });
    });
    when('tokenA should not be mapped', () => {
      let transformers: string[];
      given(async () => {
        await transformerOracle.connect(admin).avoidMappingToUnderlying([TOKEN_A]);
        transformers = await transformerOracle.internalGetTransformers(TOKEN_A, TOKEN_B);
      });
      then('registry is called correctly', () => {
        expect(registry.transformers).to.have.been.calledOnceWith([TOKEN_A, TOKEN_B]);
      });
      then('tokenB is mapped', () => {
        expect(transformers).to.eql([constants.AddressZero, UNDERLYING_TOKEN_B]);
      });
    });
    when('tokenB should not be mapped', () => {
      let transformers: string[];
      given(async () => {
        await transformerOracle.connect(admin).avoidMappingToUnderlying([TOKEN_B]);
        transformers = await transformerOracle.internalGetTransformers(TOKEN_A, TOKEN_B);
      });
      then('registry is called correctly', () => {
        expect(registry.transformers).to.have.been.calledOnceWith([TOKEN_A, TOKEN_B]);
      });
      then('tokenA is mapped', () => {
        expect(transformers).to.eql([UNDERLYING_TOKEN_A, constants.AddressZero]);
      });
    });
    when('both should be mapped', () => {
      let transformers: string[];
      given(async () => {
        transformers = await transformerOracle.internalGetTransformers(TOKEN_A, TOKEN_B);
      });
      then('registry is called correctly', () => {
        expect(registry.transformers).to.have.been.calledOnceWith([TOKEN_A, TOKEN_B]);
      });
      then('both tokens are mapped', () => {
        expect(transformers).to.eql([UNDERLYING_TOKEN_A, UNDERLYING_TOKEN_B]);
      });
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
          await transformerOracle.setMappingForPair(TOKEN_A, TOKEN_B, mappedA, mappedB);
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
