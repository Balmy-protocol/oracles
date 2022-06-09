// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './IPriceOracle.sol';

/**
 * @title An implementation of `IPriceOracle` that aggregates two or more oracles
 * @notice This oracle will use two or more oracles to support price quotes
 */
interface IOracleAggregator is IPriceOracle {
  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /**
   * @notice Returns whether this oracle can support the given pair of tokens
   * @return Whether the given pair of tokens can be supported by the oracle
   */
  function availableOracles() external view returns (IPriceOracle[] memory);
}
