// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@mean-finance/transformers/solidity/interfaces/ITransformerRegistry.sol';
import './ITokenPriceOracle.sol';

/**
 * @title An implementation of `ITokenPriceOracle` that handles transformations between tokens
 * @notice This oracle takes the transformer registry, and will transform some dependent tokens into their underlying
 *         tokens before quoting. We do this because it's hard to quote `yield-bearing(USDC) => yield-bearing(ETH)`.
 *         But we can easily do something like `yield-bearing(USDC) => USDC => ETH => yield-bearing(ETH)`. So the
 *         idea is to use the tranformer registry to transform between dependent and their underlying, and then
 *         quote the underlyings.
 */
interface ITransformerOracle is ITokenPriceOracle {
  /// @notice Thrown when a parameter is the zero address
  error ZeroAddress();

  /**
   * @notice Returns the address of the transformer registry
   * @dev Cannot be modified
   * @return The address of the transformer registry
   */
  function REGISTRY() external view returns (ITransformerRegistry);

  /**
   * @notice Returns the address of the underlying oracle
   * @dev Cannot be modified
   * @return The address of the underlying oracle
   */
  function UNDERLYING_ORACLE() external view returns (ITokenPriceOracle);
}
