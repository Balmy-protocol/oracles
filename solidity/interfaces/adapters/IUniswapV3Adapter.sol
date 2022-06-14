// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../IStaticOracle.sol'; // TODO: use the published npm library for this, and remove interface file

interface IUniswapV3Adapter {
  /// @notice The initial adapter's configuration
  struct InitialConfig {
    IStaticOracle uniswapV3Oracle;
    uint16 maxPeriod;
    uint16 minPeriod;
    uint16 initialPeriod;
    address superAdmin;
    address[] initialAdmins;
  }

  /**
   * @notice Emitted when a new period is set
   * @param period The new period
   */
  event PeriodChanged(uint32 period);

  /**
   * @notice Emitted when a new cardinality per minute is set
   * @param cardinalityPerMinute The new cardinality per minute
   */
  event CardinalityPerMinuteChanged(uint8 cardinalityPerMinute);

  /**
   * @notice Emitted when the denylist status is updated for some pools
   * @param pools The pools that were updated
   * @param denylisted Whether they will be denylisted or not
   */
  event DenylistChanged(address[] pools, bool[] denylisted);

  /**
   * @notice Emitted when support is updated (added or modified) for a new pair
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @param pools The pools assigned to the pair
   */
  event UpdatedSupport(address tokenA, address tokenB, address[] pools);

  /// @notice Thrown when one of the parameters is the zero address
  error ZeroAddress();

  /// @notice Thrown when trying to set an invalid period
  error InvalidPeriod(uint16 period);

  /// @notice Thrown when trying to set an invalid cardinality
  error InvalidCardinalityPerMinute();

  /// @notice Thrown when trying to set a denylist but the given parameters are invalid
  error InvalidDenylistParams();

  /// @notice Thrown when trying to execute a quote with a pair that isn't supported yet
  error PairNotSupportedYet(address tokenA, address tokenB);

  /**
   * @notice Returns the address of the Uniswap oracle
   * @dev Cannot be modified
   * @return The address of the Uniswap oracle
   */
  function UNISWAP_V3_ORACLE() external view returns (IStaticOracle);

  /**
   * @notice Returns the maximum possible period
   * @dev Cannot be modified
   * @return The maximum possible period
   */
  function MAX_PERIOD() external view returns (uint16);

  /**
   * @notice Returns the minimum possible period
   * @dev Cannot be modified
   * @return The minimum possible period
   */
  function MIN_PERIOD() external view returns (uint16);

  /**
   * @notice Returns the period used for the TWAP calculation
   * @return The period used for the TWAP
   */
  function period() external view returns (uint16);

  /**
   * @notice Returns the cardinality per minute used for adding support to pairs
   * @return The cardinality per minute used for increase cardinality calculations
   */
  function cardinalityPerMinute() external view returns (uint8);

  /**
   * @notice Returns whether the given pool is denylisted or not
   * @param pool The pool to check
   * @return Whether the given pool is denylisted or not
   */
  function isPoolDenylisted(address pool) external view returns (bool);

  /**
   * @notice When a pair is added to the oracle adapter, we will prepare all pools for the pair. Now, it could
   *         happen that certain pools are added for the pair at a later stage, and we can't be sure if those pools
   *         will be configured correctly. So be basically store the pools that ready for sure, and use only those
   *         for quotes. This functions returns this list of pools known to be prepared
   * @param tokenA One of the pair's tokens
   * @param tokenB The other of the pair's tokens
   * @return The list of pools that will be used for quoting
   */
  function getPoolsPreparedForPair(address tokenA, address tokenB) external view returns (address[] memory);

  /**
   * @notice Sets the period to be used for the TWAP calculation
   * @dev Will revert it is lower than the minimum period or greater than maximum period.
   *      Can only be called by users with the admin role
   *      WARNING: increasing the period could cause big problems, because Uniswap V3 pools might not support a TWAP so old
   * @param newPeriod The new period
   */
  function setPeriod(uint16 newPeriod) external;

  /**
   * @notice Sets the cardinality per minute to be used when increasing observation cardinality at the moment of adding support for pairs
   * @dev Will revert if the given cardinality is zero
   *      Can only be called by users with the admin role
   *      WARNING: increasing the cardinality per minute will make adding support to a pair significantly costly
   * @param cardinalityPerMinute The new cardinality per minute
   */
  function setCardinalityPerMinute(uint8 cardinalityPerMinute) external;

  /**
   * @notice Sets the denylist status for a set of pools
   * @dev Will revert if amount of pools does not match the amount of bools
   *      Can only be called by users with the admin role
   * @param pools The pools that were updated
   * @param denylisted Whether they will be denylisted or not
   */
  function setDenylisted(address[] calldata pools, bool[] calldata denylisted) external;
}
