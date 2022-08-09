import { BigNumber, BigNumberish } from 'ethers';
import hre, { network } from 'hardhat';
import { getNodeUrl } from 'utils/env';

export const advanceTimeAndBlock = async (time: number): Promise<void> => {
  await advanceTime(time);
  await advanceBlocks(1);
};

export const advanceToTimeAndBlock = async (time: number): Promise<void> => {
  await advanceToTime(time);
  await advanceBlocks(1);
};

export const advanceTime = async (time: number): Promise<void> => {
  await network.provider.request({
    method: 'evm_increaseTime',
    params: [time],
  });
};

export const advanceToTime = async (time: number): Promise<void> => {
  await network.provider.request({
    method: 'evm_setNextBlockTimestamp',
    params: [time],
  });
};

export const advanceBlocks = async (blocks: BigNumberish) => {
  blocks = !BigNumber.isBigNumber(blocks) ? BigNumber.from(`${blocks}`) : blocks;
  await network.provider.request({
    method: 'hardhat_mine',
    params: [blocks.toHexString().replace('0x0', '0x')],
  });
};

type ForkConfig = { network: string; skipHardhatDeployFork?: boolean } & Record<string, any>;
export const reset = async ({ network: networkName, ...forkingConfig }: ForkConfig) => {
  if (!forkingConfig.skipHardhatDeployFork) {
    process.env.HARDHAT_DEPLOY_FORK = networkName;
  }
  const params = [
    {
      forking: {
        ...forkingConfig,
        jsonRpcUrl: getNodeUrl(networkName),
      },
    },
  ];
  await network.provider.request({
    method: 'hardhat_reset',
    params,
  });
};

class SnapshotManager {
  snapshots: { [id: string]: string } = {};

  async take(): Promise<string> {
    const id = await this.takeSnapshot();
    this.snapshots[id] = id;
    return id;
  }

  async revert(id: string): Promise<void> {
    await this.revertSnapshot(this.snapshots[id]);
    this.snapshots[id] = await this.takeSnapshot();
  }

  private async takeSnapshot(): Promise<string> {
    return (await network.provider.request({
      method: 'evm_snapshot',
      params: [],
    })) as string;
  }

  private async revertSnapshot(id: string) {
    await network.provider.request({
      method: 'evm_revert',
      params: [id],
    });
  }
}

export const snapshot = new SnapshotManager();
