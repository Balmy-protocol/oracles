// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../IStaticOracle.sol'; // TODO: use the published npm library for this, and remove interface file

interface IUniswapV3Adapter {
  /// @notice The initial adapter's configuration
  struct InitialConfig {
    IStaticOracle uniswapV3Oracle;
    // uint16 maxPeriod;
    // uint16 minPeriod;
    // uint16 initialPeriod;
    address superAdmin;
    address[] initialAdmins;
  }

  /// @notice Thrown when one of the parameters is the zero address
  error ZeroAddress();

  /**
   * @notice Returns the address of the Uniswap oracle
   * @dev Cannot be modified
   * @return The address of the Uniswap oracle
   */
  function UNISWAP_V3_ORACLE() external view returns (IStaticOracle);
}
