// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@mean-finance/transformers/solidity/interfaces/ITransformerRegistry.sol';
import './ITokenPriceOracle.sol';

/**
 * @title An implementation of `ITokenPriceOracle` that handles transformations between tokens
 * @notice This oracle takes the transformer registry, and will transform some dependent tokens into their underlying
 *         tokens before quoting. We do this because it's hard to quote `yield-bearing(USDC) => yield-bearing(ETH)`.
 *         But we can easily do something like `yield-bearing(USDC) => USDC => ETH => yield-bearing(ETH)`. So the
 *         idea is to use the transformer registry to transform between dependent and their underlying, and then
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

  /**
   * @notice Takes a pair of tokens, and checks if any of them is registered as a dependent on the registry.
   *         If any of them are, then they are transformed to their underlying tokens. If they aren't, then
   *         they are simply returned
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @return underlyingTokenA tokenA's underlying token (if exists), or tokenA if there is no underlying token
   * @return underlyingTokenB tokenB's underlying token (if exists), or tokenB if there is no underlying token
   */
  function mapPairToUnderlying(address tokenA, address tokenB) external view returns (address underlyingTokenA, address underlyingTokenB);
}
