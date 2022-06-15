// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../interfaces//adapters/IUniswapV3Adapter.sol';

contract UniswapV3Adapter is AccessControl, IUniswapV3Adapter {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  /// @inheritdoc IUniswapV3Adapter
  IStaticOracle public immutable UNISWAP_V3_ORACLE;
  /// @inheritdoc IUniswapV3Adapter
  uint16 public immutable MAX_PERIOD;
  /// @inheritdoc IUniswapV3Adapter
  uint16 public immutable MIN_PERIOD;
  /// @inheritdoc IUniswapV3Adapter
  uint16 public period;
  /// @inheritdoc IUniswapV3Adapter
  uint8 public cardinalityPerMinute;
  /// @inheritdoc IUniswapV3Adapter
  mapping(address => bool) public isPoolDenylisted;

  constructor(InitialConfig memory _initialConfig) {
    if (_initialConfig.superAdmin == address(0)) revert ZeroAddress();
    UNISWAP_V3_ORACLE = _initialConfig.uniswapV3Oracle;
    MAX_PERIOD = _initialConfig.maxPeriod;
    MIN_PERIOD = _initialConfig.minPeriod;
    _setupRole(SUPER_ADMIN_ROLE, _initialConfig.superAdmin);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    for (uint256 i; i < _initialConfig.initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialConfig.initialAdmins[i]);
    }

    // Set the period
    if (_initialConfig.initialPeriod < MIN_PERIOD || _initialConfig.initialPeriod > MAX_PERIOD)
      revert InvalidPeriod(_initialConfig.initialPeriod);
    period = _initialConfig.initialPeriod;
    emit PeriodChanged(_initialConfig.initialPeriod);

    // Set cardinality, by using the oracle's default
    uint8 _cardinality = UNISWAP_V3_ORACLE.CARDINALITY_PER_MINUTE();
    cardinalityPerMinute = _cardinality;
    emit CardinalityPerMinuteChanged(_cardinality);
  }

  /// @inheritdoc IUniswapV3Adapter
  function setPeriod(uint16 _newPeriod) external onlyRole(ADMIN_ROLE) {
    if (_newPeriod < MIN_PERIOD || _newPeriod > MAX_PERIOD) revert InvalidPeriod(_newPeriod);
    period = _newPeriod;
    emit PeriodChanged(_newPeriod);
  }

  /// @inheritdoc IUniswapV3Adapter
  function setCardinalityPerMinute(uint8 _cardinalityPerMinute) external onlyRole(ADMIN_ROLE) {
    if (_cardinalityPerMinute == 0) revert InvalidCardinalityPerMinute();
    cardinalityPerMinute = _cardinalityPerMinute;
    emit CardinalityPerMinuteChanged(_cardinalityPerMinute);
  }

  /// @inheritdoc IUniswapV3Adapter
  function setDenylisted(address[] calldata _pools, bool[] calldata _denylisted) external onlyRole(ADMIN_ROLE) {
    if (_pools.length != _denylisted.length) revert InvalidDenylistParams();
    for (uint256 i; i < _pools.length; i++) {
      isPoolDenylisted[_pools[i]] = _denylisted[i];
    }
    emit DenylistChanged(_pools, _denylisted);
  }
}
