// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/**
 * @title The interface for an oracle that provides price quotes
 * @notice These methods allow users to add support for pairs, and then ask for quotes
 */
interface IPriceOracle {
  /// @notice Thrown when trying to execute an action with an unsupported pair
  error PairNotSupported(address tokenA, address tokenB);

  /**
   * @notice Returns whether this oracle can support the given pair of tokens
   * @dev tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @return Whether the given pair of tokens can be supported by the oracle
   */
  function canSupportPair(address tokenA, address tokenB) external view returns (bool);

  /**
   * @notice Returns whether this oracle is already supporting the given pair of tokens
   * @dev tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @return Whether the given pair of tokens is already being supported by the oracle
   */
  function isPairAlreadySupported(address tokenA, address tokenB) external view returns (bool);

  /**
   * @notice Returns a quote, based on the given tokens and amount
   * @param tokenIn The token that will be provided
   * @param amountIn The amount that will be provided
   * @param tokenOut The token we would like to quote
   * @return amountOut How much `tokenOut` will be returned in exchange for `amountIn` amount of `tokenIn`
   */
  function quote(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256 amountOut);

  /**
   * @notice Add or reconfigures the support for a given pair. This function will let the oracle take some actions
   *         to configure the pair, in preparation for future quotes. Can be called many times in order to let the oracle
   *         re-configure for a new context
   * @dev Will revert if pair cannot be supported. tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   */
  function addOrModifySupportForPair(address tokenA, address tokenB) external;

  /**
   * @notice Adds support for a given pair if the oracle didn't support it already. If called for a pair that is already supported,
   *         then nothing will happen. This function will let the oracle take some actions to configure the pair, in preparation
   *         for future quotes
   * @dev Will revert if pair cannot be supported. tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   */
  function addSupportForPairIfNeeded(address tokenA, address tokenB) external;
}
