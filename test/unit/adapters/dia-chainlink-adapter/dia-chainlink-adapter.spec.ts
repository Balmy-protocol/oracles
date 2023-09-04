import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, utils } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { IDIAOracleV2, DIAChainlinkAdapter, DIAChainlinkAdapter__factory } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('DIAChainlinkAdapter', () => {
  const ORACLE_DECIMALS = 8;
  const FEED_DECIMALS = 8;
  const DESCRIPTION = 'ETH/USD';
  const VALUE_WITH_8_DECIMALS = utils.parseUnits('1.2345', 8);
  const TIMESTAMP = 678910;
  const LATEST_ROUND = 0;

  let adapter: DIAChainlinkAdapter;
  let diaOracle: FakeContract<IDIAOracleV2>;
  let snapshotId: string;

  before(async () => {
    diaOracle = await smock.fake('IDIAOracleV2');
    const factory: DIAChainlinkAdapter__factory = await ethers.getContractFactory('DIAChainlinkAdapter');
    adapter = await factory.deploy(diaOracle.address, ORACLE_DECIMALS, FEED_DECIMALS, DESCRIPTION);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    diaOracle.getValue.reset();
    diaOracle.getValue.returns([VALUE_WITH_8_DECIMALS, TIMESTAMP]);
  });

  describe('constructor', () => {
    when('deployed', () => {
      then('description is set correctly', async () => {
        const description = await adapter.description();
        expect(description).to.equal(DESCRIPTION);
      });
      then('decimals is set correctly', async () => {
        expect(await adapter.decimals()).to.equal(FEED_DECIMALS);
      });
      then('DIA oracle is set correctly', async () => {
        expect(await adapter.DIA_ORACLE()).to.equal(diaOracle.address);
      });
    });
  });

  describe('version', () => {
    when('called', () => {
      then('value should revert', async () => {
        then('reverts with message', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: adapter,
            func: 'version',
            args: [1],
            message: 'NotImplemented',
          });
        });
      });
    });
  });

  describe('getRoundData', () => {
    when('called with an invalid round', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'getRoundData',
          args: [1],
          message: 'OnlyLatestRoundIsAvailable',
        });
      });
    });
    when('called with the latest round', () => {
      let _roundId: BigNumber, _answer: BigNumber, _startedAt: BigNumber, _updatedAt: BigNumber, _answeredInRound: BigNumber;

      given(async () => {
        ({ _roundId, _answer, _startedAt, _updatedAt, _answeredInRound } = await adapter.getRoundData(LATEST_ROUND));
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(_roundId).to.equal(LATEST_ROUND);
        expect(_answer).to.equal(VALUE_WITH_8_DECIMALS);
        expect(_startedAt).to.equal(TIMESTAMP);
        expect(_updatedAt).to.equal(TIMESTAMP);
        expect(_answeredInRound).to.equal(LATEST_ROUND);
      });
    });
  });

  describe('latestRoundData', () => {
    when('called', () => {
      let _roundId: BigNumber, _answer: BigNumber, _startedAt: BigNumber, _updatedAt: BigNumber, _answeredInRound: BigNumber;

      given(async () => {
        ({ _roundId, _answer, _startedAt, _updatedAt, _answeredInRound } = await adapter.latestRoundData());
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(_roundId).to.equal(LATEST_ROUND);
        expect(_answer).to.equal(VALUE_WITH_8_DECIMALS);
        expect(_startedAt).to.equal(TIMESTAMP);
        expect(_updatedAt).to.equal(TIMESTAMP);
        expect(_answeredInRound).to.equal(LATEST_ROUND);
      });
    });
  });

  describe('latestAnswer', () => {
    when('called', () => {
      let answer: BigNumber;

      given(async () => {
        answer = await adapter.latestAnswer();
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(answer).to.equal(VALUE_WITH_8_DECIMALS);
      });
    });
  });

  describe('latestTimestamp', () => {
    when('called', () => {
      let timestamp: BigNumber;

      given(async () => {
        timestamp = await adapter.latestTimestamp();
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(timestamp).to.equal(TIMESTAMP);
      });
    });
  });

  describe('latestRound', () => {
    when('called', () => {
      then('value is returned correctly', async () => {
        expect(await adapter.latestRound()).to.equal(LATEST_ROUND);
      });
    });
  });

  describe('getAnswer', () => {
    when('called with an invalid round', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'getAnswer',
          args: [1],
          message: 'OnlyLatestRoundIsAvailable',
        });
      });
    });
    when('called with the latest round', () => {
      let answer: BigNumber;

      given(async () => {
        answer = await adapter.getAnswer(LATEST_ROUND);
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(answer).to.equal(VALUE_WITH_8_DECIMALS);
      });
    });
  });

  describe('getTimestamp', () => {
    when('called with an invalid round', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: adapter,
          func: 'getTimestamp',
          args: [1],
          message: 'OnlyLatestRoundIsAvailable',
        });
      });
    });
    when('called with the latest round', () => {
      let timestamp: BigNumber;

      given(async () => {
        timestamp = await adapter.getTimestamp(LATEST_ROUND);
      });
      then('oracle is called correctly', () => {
        expect(diaOracle.getValue).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(timestamp).to.equal(TIMESTAMP);
      });
    });
  });
});
