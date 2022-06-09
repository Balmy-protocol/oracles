// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@mean-finance/dca-v2-core/contracts/libraries/TokenSorting.sol';
import '../interfaces/IOracleAggregator.sol';

contract OracleAggregator is AccessControl, IOracleAggregator {

  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  // A list of available oracles. Oracles first on the array will take precedence over those that come later
  IPriceOracle[] internal _availableOracles;

  constructor(
    // IPriceOracle[] memory _initialOracles,
    address _superAdmin,
    address[] memory _initialAdmins
  ) {
    if (_superAdmin == address(0)) revert ZeroAddress();
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    for (uint i; i < _initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
    }
  }

  /// @inheritdoc IOracleAggregator
  function availableOracles() external view returns (IPriceOracle[] memory) {
    return _availableOracles;
  }

}

