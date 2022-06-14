// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../interfaces//adapters/IUniswapV3Adapter.sol';

contract UniswapV3Adapter is AccessControl, IUniswapV3Adapter {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  /// @inheritdoc IUniswapV3Adapter
  IStaticOracle public immutable UNISWAP_V3_ORACLE;

  // uint16 public immutable maxPeriod;
  // uint16 public immutable minPeriod;
  // uint16 public period;
  // uint8 public cardinalityPerMinute;

  constructor(InitialConfig memory _initialConfig) {
    UNISWAP_V3_ORACLE = _initialConfig.uniswapV3Oracle;
    if (_initialConfig.superAdmin == address(0)) revert ZeroAddress();
    _setupRole(SUPER_ADMIN_ROLE, _initialConfig.superAdmin);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    for (uint256 i; i < _initialConfig.initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialConfig.initialAdmins[i]);
    }
  }
}
