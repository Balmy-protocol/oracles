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
  mapping(bytes32 => OracleAssignment) internal _assignedOracle; // key(tokenA, tokenB) => oracle

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

  /// @inheritdoc IPriceOracle
  function addOrModifySupportForPair(address _tokenA, address _tokenB) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    /* 
      Only modify if one of the following is true:
        - There is no current oracle
        - The current oracle hasn't been forced by an admin
        - The caller is an admin
    */
    bool _shouldModify = !_assignedOracle[_keyForPair(__tokenA, __tokenB)].forced || hasRole(ADMIN_ROLE, msg.sender);
    if (_shouldModify) {
      _addOrModifySupportForPair(__tokenA, __tokenB);
    }
  }

  /// @inheritdoc IOracleAggregator
  function assignedOracle(address _tokenA, address _tokenB) external view returns (OracleAssignment memory) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _assignedOracle[_keyForPair(__tokenA, __tokenB)];
  }

  /// @inheritdoc IOracleAggregator
  function availableOracles() external view returns (IPriceOracle[] memory) {
    return _availableOracles;
  }

  /// @inheritdoc IOracleAggregator
  function forceOracle(
    address _tokenA,
    address _tokenB,
    IPriceOracle _oracle
  ) external onlyRole(ADMIN_ROLE) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _setOracle(__tokenA, __tokenB, _oracle, true);
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

  /**
   * @notice Checks all oracles again and re-assigns the first that supports the given pair.
   *         It will also reconfigure the assigned oracle
   * @dev We expect tokens to be sorted (tokenA < tokenB)
   */
  function _addOrModifySupportForPair(address _tokenA, address _tokenB) internal virtual {
    uint256 _length = _availableOracles.length;
    for (uint256 i; i < _length; i++) {
      IPriceOracle _oracle = _availableOracles[i];
      if (_oracle.canSupportPair(_tokenA, _tokenB)) {
        _oracle.addOrModifySupportForPair(_tokenA, _tokenB);
        _setOracle(_tokenA, _tokenB, _oracle, false);
        return;
      }
    }
    revert PairNotSupported(_tokenA, _tokenB);
  }

  /// @dev We expect tokens to be sorted (tokenA < tokenB)
  function _setOracle(
    address _tokenA,
    address _tokenB,
    IPriceOracle _oracle,
    bool _forced
  ) internal {
    _assignedOracle[_keyForPair(_tokenA, _tokenB)] = OracleAssignment({oracle: _oracle, forced: _forced});
    emit OracleAssigned(_tokenA, _tokenB, _oracle);
  }

  /// @dev We expect tokens to be sorted (tokenA < tokenB)
  function _keyForPair(address _tokenA, address _tokenB) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_tokenA, _tokenB));
  }
}
