// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/ITokenPriceOracle.sol';

interface ILegacyPriceOracle {
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool);

  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  function reconfigureSupportForPair(address _tokenA, address _tokenB) external;

  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external;
}

contract LegacyPriceOracleAdapter is ILegacyPriceOracle {
  ITokenPriceOracle public immutable oracle;

  constructor(ITokenPriceOracle _oracle) {
    oracle = _oracle;
  }

  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    return oracle.canSupportPair(_tokenA, _tokenB);
  }

  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut) {
    return oracle.quote(_tokenIn, _amountIn, _tokenOut, '');
  }

  function reconfigureSupportForPair(address _tokenA, address _tokenB) external {
    oracle.addOrModifySupportForPair(_tokenA, _tokenB, '');
  }

  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external {
    oracle.addSupportForPairIfNeeded(_tokenA, _tokenB, '');
  }
}
