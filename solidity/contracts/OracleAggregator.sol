// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@mean-finance/dca-v2-core/contracts/libraries/TokenSorting.sol';
import './base/BaseOracle.sol';
import '../interfaces/IOracleAggregator.sol';

contract OracleAggregator is AccessControl, BaseOracle, IOracleAggregator {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  // A list of available oracles. Oracles first on the array will take precedence over those that come later
  ITokenPriceOracle[] internal _availableOracles;
  mapping(bytes32 => OracleAssignment) internal _assignedOracle; // key(tokenA, tokenB) => oracle

  constructor(
    ITokenPriceOracle[] memory _initialOracles,
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

  /// @inheritdoc ITokenPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    uint256 _length = _availableOracles.length;
    for (uint256 i; i < _length; i++) {
      if (_availableOracles[i].canSupportPair(_tokenA, _tokenB)) {
        return true;
      }
    }
    return false;
  }

  /// @inheritdoc ITokenPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) public view returns (bool) {
    ITokenPriceOracle _oracle = assignedOracle(_tokenA, _tokenB).oracle;
    // We check if the oracle still supports the pair, since it might have lost support
    return address(_oracle) != address(0) && _oracle.isPairAlreadySupported(_tokenA, _tokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes memory _data
  ) public view returns (uint256 _amountOut) {
    ITokenPriceOracle _oracle = assignedOracle(_tokenIn, _tokenOut).oracle;
    if (address(_oracle) == address(0)) revert PairNotSupportedYet(_tokenIn, _tokenOut);
    return _oracle.quote(_tokenIn, _amountIn, _tokenOut, _data);
  }

  /// @inheritdoc ITokenPriceOracle
  function addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes memory _data
  ) public {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    /* 
      Only modify if one of the following is true:
        - There is no current oracle
        - The current oracle hasn't been forced by an admin
        - The caller is an admin
    */
    bool _shouldModify = !_assignedOracleForPair(__tokenA, __tokenB).forced || hasRole(ADMIN_ROLE, msg.sender);
    if (_shouldModify) {
      _addOrModifySupportForPair(__tokenA, __tokenB, _data);
    }
  }

  /// @inheritdoc ITokenPriceOracle
  function addSupportForPairIfNeeded(
    address _tokenA,
    address _tokenB,
    bytes memory _data
  ) public {
    if (!isPairAlreadySupported(_tokenA, _tokenB)) {
      (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
      _addOrModifySupportForPair(__tokenA, __tokenB, _data);
    }
  }

  /// @inheritdoc IOracleAggregator
  function assignedOracle(address _tokenA, address _tokenB) public view returns (OracleAssignment memory) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _assignedOracleForPair(__tokenA, __tokenB);
  }

  /// @inheritdoc IOracleAggregator
  function availableOracles() external view returns (ITokenPriceOracle[] memory) {
    return _availableOracles;
  }

  /// @inheritdoc IOracleAggregator
  function forceOracle(
    address _tokenA,
    address _tokenB,
    ITokenPriceOracle _oracle
  ) external onlyRole(ADMIN_ROLE) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _setOracle(__tokenA, __tokenB, _oracle, true);
  }

  /// @inheritdoc IOracleAggregator
  function setAvailableOracles(ITokenPriceOracle[] calldata _oracles) external onlyRole(ADMIN_ROLE) {
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

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 _interfaceId) public view virtual override(AccessControl, BaseOracle) returns (bool) {
    return
      _interfaceId == type(IOracleAggregator).interfaceId ||
      AccessControl.supportsInterface(_interfaceId) ||
      BaseOracle.supportsInterface(_interfaceId);
  }

  /**
   * @notice Checks all oracles again and re-assigns the first that supports the given pair.
   *         It will also reconfigure the assigned oracle
   * @dev We expect tokens to be sorted (tokenA < tokenB)
   */
  function _addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes memory _data
  ) internal virtual {
    uint256 _length = _availableOracles.length;
    for (uint256 i; i < _length; i++) {
      ITokenPriceOracle _oracle = _availableOracles[i];
      if (_oracle.canSupportPair(_tokenA, _tokenB)) {
        _oracle.addOrModifySupportForPair(_tokenA, _tokenB, _data);
        _setOracle(_tokenA, _tokenB, _oracle, false);
        return;
      }
    }
    revert PairCannotBeSupported(_tokenA, _tokenB);
  }

  /// @dev We expect tokens to be sorted (tokenA < tokenB)
  function _setOracle(
    address _tokenA,
    address _tokenB,
    ITokenPriceOracle _oracle,
    bool _forced
  ) internal {
    _assignedOracle[_keyForPair(_tokenA, _tokenB)] = OracleAssignment({oracle: _oracle, forced: _forced});
    emit OracleAssigned(_tokenA, _tokenB, _oracle);
  }

  /// @dev We expect tokens to be sorted (tokenA < tokenB)
  function _assignedOracleForPair(address _tokenA, address _tokenB) internal view returns (OracleAssignment memory) {
    return _assignedOracle[_keyForPair(_tokenA, _tokenB)];
  }

  /// @dev We expect tokens to be sorted (tokenA < tokenB)
  function _keyForPair(address _tokenA, address _tokenB) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_tokenA, _tokenB));
  }
}
