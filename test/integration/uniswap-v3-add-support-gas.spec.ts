import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@utils';
import { UniswapV3Adapter } from '@typechained';
import { constants } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { snapshot } from '@utils/evm';

const BLOCK_NUMBER = 13838662;
const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

const DAI = '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1';
const RAI = '0x7fb688ccf682d58f86d7e38e03f9d22e7705448b';

describe('Uniswap v3 Add Support - Gas Test', () => {
  let oracle: UniswapV3Adapter;
  let snapshotId: string;

  before(async () => {
    await fork({ chain: 'optimism', blockNumber: BLOCK_NUMBER });
    await deployments.fixture(['UniswapV3Adapter'], { keepExistingDeployments: false });
    oracle = await ethers.getContract<UniswapV3Adapter>('UniswapV3Adapter');
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('add support for uninitialized pools', () => {
    when('adding support for a pair with many uninitialized pools fails', async () => {
      given(async () => {
        expect(await oracle.getPoolsPreparedForPair(DAI, RAI)).to.have.lengthOf(0);
        await oracle.addSupportForPairIfNeeded(DAI, RAI, BYTES);
      });
      then('pools were added correctly', async () => {
        expect(await oracle.getPoolsPreparedForPair(DAI, RAI)).to.have.lengthOf(2);
      });
    });
  });

  async function fork({ chain, blockNumber }: { chain: string; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      network: chain,
      blockNumber,
    });
    const { deployer: deployerAddress, eoaAdmin } = await getNamedAccounts();
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(eoaAdmin);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );
    await deterministicFactory.connect(admin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployerAddress);
  }
});
