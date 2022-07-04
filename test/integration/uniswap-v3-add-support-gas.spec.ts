import hre, { deployments, ethers } from 'hardhat';
import { evm, wallet } from '@utils';
import { getNodeUrl } from 'utils/env';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { UniswapV3Adapter } from '@typechained';
import { constants, utils } from 'ethers';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { setTestChainId } from 'utils/deploy';
import { expect } from 'chai';
import { given, then, when } from '@utils/bdd';
import { TransactionResponse } from '@ethersproject/providers';
import { snapshot } from '@utils/evm';

const CHAIN = { chain: 'optimism', chainId: 10 };
const BLOCK_NUMBER = 13838662;
const BYTES = '0xf2c047db4a7cf81f935c'; // Some random bytes

const WETH = '0x4200000000000000000000000000000000000006';
const SNX = '0x8700daec35af8ff88c16bdf0418774cb3d7599b4';

describe('Uniswap v3 Add Support - Gas Test', () => {
  let deployer: SignerWithAddress;
  let oracle: UniswapV3Adapter;
  let snapshotId: string;

  before(async () => {
    const { deployer: deployerAddress } = await hre.getNamedAccounts();
    deployer = await ethers.getSigner(deployerAddress);
    await fork({ ...CHAIN, blockNumber: BLOCK_NUMBER });
    await deployments.fixture(['UniswapV3Adapter'], { keepExistingDeployments: true });
    oracle = await ethers.getContract<UniswapV3Adapter>('UniswapV3Adapter');
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('add support for uninitialized pools', () => {
    when('adding support for a pair with many uninitialized pools fails', async () => {
      let tx: Promise<TransactionResponse>;
      given(() => {
        tx = oracle.addSupportForPairIfNeeded(WETH, SNX, BYTES);
      });
      then('tx is reverted', async () => {
        await expect(tx).to.have.reverted;
      });
    });
  });

  const DETERMINISTIC_FACTORY_ADMIN = '0x1a00e1e311009e56e3b0b9ed6f86f5ce128a1c01';
  const DEPLOYER_ROLE = utils.keccak256(utils.toUtf8Bytes('DEPLOYER_ROLE'));
  async function fork({ chain, chainId, blockNumber }: { chain: string; chainId: number; blockNumber?: number }): Promise<void> {
    // Set fork of network
    await evm.reset({
      jsonRpcUrl: getNodeUrl(chain),
      blockNumber,
    });
    setTestChainId(chainId);
    // Give deployer role to our deployer address
    const admin = await wallet.impersonate(DETERMINISTIC_FACTORY_ADMIN);
    await wallet.setBalance({ account: admin._address, balance: constants.MaxUint256 });
    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );
    await deterministicFactory.connect(admin).grantRole(DEPLOYER_ROLE, deployer.address);
  }
});
