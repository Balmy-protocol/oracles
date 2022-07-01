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
   * @notice Emitted when new dependents are set to avoid mapping to their underlying counterparts
   * @param dependents The tokens that will avoid mapping
   */
  event DependentsWillAvoidMappingToUnderlying(address[] dependents);

  /**
   * @notice Emitted when dependents are set to map to their underlying counterparts
   * @param dependents The tokens that will map to underlying
   */
  event DependentsWillMapToUnderlying(address[] dependents);

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
   * @notice Returns whether the given dependent will avoid mapping to their underlying counterparts
   * @param dependent The dependent token to check
   * @return Whether the given dependent will avoid mapping to their underlying counterparts
   */
  function willAvoidMappingToUnderlying(address dependent) external view returns (bool);

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

  /**
   * @notice Determines that the given dependents will avoid mapping to their underlying counterparts, and
   *         instead perform quotes with their own addreses. This comes in handy with situations such as
   *         ETH/WETH, where some oracles use WETH instead of ETH
   * @param dependents The dependent tokens that should avoid mapping to underlying
   */
  function avoidMappingToUnderlying(address[] calldata dependents) external;

  /**
   * @notice Determines that the given dependents go back to mapping to their underlying counterparts (the
   *         default behaviour)
   * @param dependents The dependent tokens that should go back to mapping to underlying
   */
  function shouldMapToUnderlying(address[] calldata dependents) external;
}
