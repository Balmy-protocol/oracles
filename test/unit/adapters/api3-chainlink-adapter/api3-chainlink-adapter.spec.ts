import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, utils } from 'ethers';
import { behaviours } from '@utils';
import { given, then, when } from '@utils/bdd';
import { IProxy, API3ChainlinkAdapter, API3ChainlinkAdapter__factory } from '@typechained';
import { snapshot } from '@utils/evm';
import { smock, FakeContract } from '@defi-wonderland/smock';

chai.use(smock.matchers);

describe('API3ChainlinkAdapter', () => {
  const DESCRIPTION = 'TOKEN/USD';
  const VALUE_WITH_18_DECIMALS = utils.parseEther('1.2345');
  const VALUE_WITH_8_DECIMALS = utils.parseUnits('1.2345', 8);
  const TIMESTAMP = 678910;
  const LATEST_ROUND = 0;

  let adapter: API3ChainlinkAdapter;
  let api3Proxy: FakeContract<IProxy>;
  let snapshotId: string;

  before(async () => {
    api3Proxy = await smock.fake('IProxy');
    const factory: API3ChainlinkAdapter__factory = await ethers.getContractFactory('API3ChainlinkAdapter');
    adapter = await factory.deploy(api3Proxy.address, DESCRIPTION);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    api3Proxy.read.reset();
    api3Proxy.read.returns([VALUE_WITH_18_DECIMALS, TIMESTAMP]);
  });

  describe('constructor', () => {
    when('deployed', () => {
      then('description is set correctly', async () => {
        const description = await adapter.description();
        expect(description).to.equal(DESCRIPTION);
      });
      then('API3 proxy is set correctly', async () => {
        expect(await adapter.API3_PROXY()).to.equal(api3Proxy.address);
      });
    });
  });

  describe('decimals', () => {
    when('called', () => {
      then('value is returned correctly', async () => {
        expect(await adapter.decimals()).to.equal(8);
      });
    });
  });

  describe('version', () => {
    when('called', () => {
      then('value is returned correctly', async () => {
        expect(await adapter.version()).to.equal(4);
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
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
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

  describe('getRoundData', () => {
    when('called', () => {
      let _roundId: BigNumber, _answer: BigNumber, _startedAt: BigNumber, _updatedAt: BigNumber, _answeredInRound: BigNumber;

      given(async () => {
        ({ _roundId, _answer, _startedAt, _updatedAt, _answeredInRound } = await adapter.latestRoundData());
      });
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
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
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
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
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
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
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
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
      then('proxy is called correctly', () => {
        expect(api3Proxy.read).to.have.been.calledOnce;
      });
      then('value is returned correctly', () => {
        expect(timestamp).to.equal(TIMESTAMP);
      });
    });
  });
});
