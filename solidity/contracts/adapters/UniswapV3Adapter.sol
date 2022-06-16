// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '@mean-finance/dca-v2-core/contracts/libraries/TokenSorting.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '../../interfaces//adapters/IUniswapV3Adapter.sol';

contract UniswapV3Adapter is AccessControl, IUniswapV3Adapter {
  using SafeCast for uint256;

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

  mapping(bytes32 => bool) internal _isPairDenylisted; // key(tokenA, tokenB) => is denylisted
  mapping(bytes32 => address[]) internal _poolsForPair; // key(tokenA, tokenB) => pools

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

  /// @inheritdoc IPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    return !_isPairDenylisted[_keyForPair(_tokenA, _tokenB)] && UNISWAP_V3_ORACLE.getAllPoolsForPair(_tokenA, _tokenB).length > 0;
  }

  /// @inheritdoc IPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) public view returns (bool) {
    return _poolsForPair[_keyForPair(_tokenA, _tokenB)].length > 0;
  }

  /// @inheritdoc IPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) public view returns (uint256 _amountOut) {
    address[] memory _pools = _poolsForPair[_keyForPair(_tokenIn, _tokenOut)];
    if (_pools.length == 0) revert PairNotSupportedYet(_tokenIn, _tokenOut);
    return UNISWAP_V3_ORACLE.quoteSpecificPoolsWithTimePeriod(_amountIn.toUint128(), _tokenIn, _tokenOut, _pools, period);
  }

  /// @inheritdoc IPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes calldata
  ) external view returns (uint256) {
    return quote(_tokenIn, _amountIn, _tokenOut);
  }

  /// @inheritdoc IPriceOracle
  function addOrModifySupportForPair(address _tokenA, address _tokenB) public {
    delete _poolsForPair[_keyForPair(_tokenA, _tokenB)];
    _addOrModifySupportForPair(_tokenA, _tokenB);
  }

  /// @inheritdoc IPriceOracle
  function addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata
  ) external {
    addOrModifySupportForPair(_tokenA, _tokenB);
  }

  /// @inheritdoc IPriceOracle
  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) public {
    if (!isPairAlreadySupported(_tokenA, _tokenB)) {
      _addOrModifySupportForPair(_tokenA, _tokenB);
    }
  }

  /// @inheritdoc IPriceOracle
  function addSupportForPairIfNeeded(
    address _tokenA,
    address _tokenB,
    bytes calldata
  ) external {
    addSupportForPairIfNeeded(_tokenA, _tokenB);
  }

  /// @inheritdoc IUniswapV3Adapter
  function isPairDenylisted(address _tokenA, address _tokenB) external view returns (bool) {
    return _isPairDenylisted[_keyForPair(_tokenA, _tokenB)];
  }

  /// @inheritdoc IUniswapV3Adapter
  function getPoolsPreparedForPair(address _tokenA, address _tokenB) external view returns (address[] memory) {
    return _poolsForPair[_keyForPair(_tokenA, _tokenB)];
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
  function setDenylisted(Pair[] calldata _pairs, bool[] calldata _denylisted) external onlyRole(ADMIN_ROLE) {
    if (_pairs.length != _denylisted.length) revert InvalidDenylistParams();
    for (uint256 i; i < _pairs.length; i++) {
      bytes32 _pairKey = _keyForPair(_pairs[i].tokenA, _pairs[i].tokenB);
      _isPairDenylisted[_pairKey] = _denylisted[i];
      if (_denylisted[i]) {
        delete _poolsForPair[_pairKey];
      }
    }
    emit DenylistChanged(_pairs, _denylisted);
  }

  function _addOrModifySupportForPair(address _tokenA, address _tokenB) internal {
    bytes32 _pairKey = _keyForPair(_tokenA, _tokenB);
    if (_isPairDenylisted[_pairKey]) revert PairNotSupported(_tokenA, _tokenB);

    uint16 _cardinality = uint16((uint32(period) * cardinalityPerMinute) / 60) + 1;
    address[] memory _pools = UNISWAP_V3_ORACLE.prepareAllAvailablePoolsWithCardinality(_tokenA, _tokenB, _cardinality);
    if (_pools.length == 0) revert PairNotSupported(_tokenA, _tokenB);

    address[] storage _storagePools = _poolsForPair[_pairKey];
    for (uint256 i; i < _pools.length; i++) {
      _storagePools.push(_pools[i]);
    }

    emit UpdatedSupport(_tokenA, _tokenB, _pools);
  }

  function _keyForPair(address _tokenA, address _tokenB) internal pure returns (bytes32) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return keccak256(abi.encodePacked(__tokenA, __tokenB));
  }
}
