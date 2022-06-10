// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './IPriceOracle.sol';

/**
 * @title An implementation of `IPriceOracle` that aggregates two or more oracles. It's important to
 *        note that this oracle is permissioned. Admins can determine available oracles and they can
 *        also force an oracle for a specific pair
 * @notice This oracle will use two or more oracles to support price quotes
 */
interface IOracleAggregator is IPriceOracle {
  /// @notice An oracle's assignment for a specific pair
  struct OracleAssignment {
    // The oracle's address
    IPriceOracle oracle;
    // Whether the oracle was forced by an admin. If forced, only an admin can modify it
    bool forced;
  }

  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /**
   * @notice Emitted when the list of oracles is updated
   * @param oracles The new list of oracles
   */
  event OracleListUpdated(IPriceOracle[] oracles);

  /**
   * @notice Emitted when an oracle is assigned to a pair
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @param oracle The oracle that was assigned to the pair
   */
  event OracleAssigned(address tokenA, address tokenB, IPriceOracle oracle);

  /**
   * @notice Returns the assigned oracle (or the zero address if there isn't one) for the given pair
   * @dev tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @return The assigned oracle for the given pair
   */
  function assignedOracle(address tokenA, address tokenB) external view returns (OracleAssignment memory);

  /**
   * @notice Returns whether this oracle can support the given pair of tokens
   * @return Whether the given pair of tokens can be supported by the oracle
   */
  function availableOracles() external view returns (IPriceOracle[] memory);

  /**
   * @notice Sets a new oracle for the given pair. After it's sent, only other admins will be able
   *         to modify the pair's oracle
   * @dev Can only be called by users with the admin role
   *      tokenA and tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @param oracle The oracle to set
   */
  function forceOracle(
    address tokenA,
    address tokenB,
    IPriceOracle oracle
  ) external;

  /**
   * @notice Sets a new list of oracles to be used by the aggregator
   * @dev Can only be called by users with the admin role
   * @param oracles The new list of oracles to set
   */
  function setAvailableOracles(IPriceOracle[] calldata oracles) external;
}
