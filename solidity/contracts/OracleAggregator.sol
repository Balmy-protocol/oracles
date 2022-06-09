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
    IPriceOracle[] memory _initialOracles,
    address _superAdmin,
    address[] memory _initialAdmins
  ) {
    if (_superAdmin == address(0)) revert ZeroAddress();
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    for (uint256 i; i < _initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
    }

    if (_initialOracles.length > 0) {
      for (uint256 i; i < _initialOracles.length; i++) {
        _availableOracles.push(_initialOracles[i]);
      }
      emit OracleListUpdated(_initialOracles);
    }
  }

  /// @inheritdoc IPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    uint256 _length = _availableOracles.length;
    for (uint256 i; i < _length; i++) {
      if (_availableOracles[i].canSupportPair(_tokenA, _tokenB)) {
        return true;
      }
    }
    return false;
  }

  /// @inheritdoc IOracleAggregator
  function availableOracles() external view returns (IPriceOracle[] memory) {
    return _availableOracles;
  }

  /// @inheritdoc IOracleAggregator
  function setAvailableOracles(IPriceOracle[] calldata _oracles) external onlyRole(ADMIN_ROLE) {
    uint256 _currentAvailableOracles = _availableOracles.length;
    uint256 _min = _currentAvailableOracles < _oracles.length ? _currentAvailableOracles : _oracles.length;

    uint256 i;
    for (; i < _min; i++) {
      // Rewrite storage
      _availableOracles[i] = _oracles[i];
    }
    if (_currentAvailableOracles < _oracles.length) {
      // If have more oracles than before, then push
      for (; i < _oracles.length; i++) {
        _availableOracles.push(_oracles[i]);
      }
    } else if (_currentAvailableOracles > _oracles.length) {
      // If have less oracles than before, then remove extra oracles
      for (; i < _currentAvailableOracles; i++) {
        _availableOracles.pop();
      }
    }

    emit OracleListUpdated(_oracles);
  }
}
