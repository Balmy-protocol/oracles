import { HardhatRuntimeEnvironment } from 'hardhat/types';

// Hardhat caches named accounts, so if we ask for the msig in Polygon, it will return the same address
// when we ask for it on Ethereum. So we are reading it directly from the config each time
export async function getNamedAccounts(hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const network = hre.deployments.getNetworkName();
  const msig = (hre.config.namedAccounts.msig as any)?.[network];
  return { deployer, msig };
}
