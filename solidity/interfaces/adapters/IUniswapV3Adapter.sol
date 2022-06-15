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

  /// @notice Thrown when one of the parameters is the zero address
  error ZeroAddress();

  /// @notice Thrown when trying to set an invalid period
  error InvalidPeriod(uint16 period);

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
   * @notice Sets the period to be used for the TWAP calculation
   * @dev Will revert it is lower than the minimum period or greater than maximum period
   *      WARNING: increasing the period could cause big problems, because Uniswap V3 pools might not support a TWAP so old
   * @param newPeriod The new period
   */
  function setPeriod(uint16 newPeriod) external;
}
