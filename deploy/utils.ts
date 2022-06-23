export function getAdminAddress(chainId: number) {
  switch (chainId) {
    case 10: // Optimism
      return '0x308810881807189cAe91950888b2cB73A1CC5920';
    case 137: // Polygon
      return '0xCe9F6991b48970d6c9Ef99Fffb112359584488e3';
    case 42161: // Arbitrum
      return '0x84F4836e8022765Af9FBCE3Bb2887fD826c668f1';
    case 69: // Optimism Kovan
    case 421611: // Arbitrum Rinkeby
    case 80001: // Polygon Mumbai
      return '0x1a00e1e311009e56e3b0b9ed6f86f5ce128a1c01';
    default:
      throw new Error(`Unsupported chain with id '${chainId}`);
  }
}
