export function getAdminAddress(chainId: number) {
  switch (chainId) {
    case 10: // Optimism
      return '0x308810881807189cAe91950888b2cB73A1CC5920';
    case 137: // Polygon
      return '0xCe9F6991b48970d6c9Ef99Fffb112359584488e3';
    default:
      throw new Error(`Unsupported chain with id '${chainId}`);
  }
}
