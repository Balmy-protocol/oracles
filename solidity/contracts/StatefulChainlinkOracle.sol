// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@chainlink/contracts/src/v0.8/Denominations.sol';
import './base/SimpleOracle.sol';
import '../interfaces/IStatefulChainlinkOracle.sol';

contract StatefulChainlinkOracle is AccessControl, SimpleOracle, IStatefulChainlinkOracle {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  /// @inheritdoc IStatefulChainlinkOracle
  mapping(address => mapping(address => PricingPlan)) public planForPair;
  /// @inheritdoc IStatefulChainlinkOracle
  FeedRegistryInterface public immutable registry;
  /// @inheritdoc IStatefulChainlinkOracle
  address public immutable WETH;
  /// @inheritdoc IStatefulChainlinkOracle
  uint32 public maxDelay;

  // solhint-disable private-vars-leading-underscore
  int8 private constant USD_DECIMALS = 8;
  int8 private constant ETH_DECIMALS = 18;
  // solhint-enable private-vars-leading-underscore

  mapping(address => bool) internal _shouldBeConsideredUSD;
  mapping(address => address) internal _tokenMappings;

  constructor(
    // solhint-disable-next-line var-name-mixedcase
    address _WETH,
    FeedRegistryInterface _registry,
    uint32 _maxDelay,
    address _superAdmin,
    address[] memory _initialAdmins
  ) {
    if (_WETH == address(0) || address(_registry) == address(0)) revert ZeroAddress();
    if (_maxDelay == 0) revert ZeroMaxDelay();
    registry = _registry;
    maxDelay = _maxDelay;
    WETH = _WETH;
    // We are setting the super admin role as its own admin so we can transfer it
    _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);
    for (uint256 i = 0; i < _initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
    }
  }

  /// @inheritdoc ITokenPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    return _plan != PricingPlan.NONE;
  }

  /// @inheritdoc ITokenPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) public view override(ITokenPriceOracle, SimpleOracle) returns (bool) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    return planForPair[__tokenA][__tokenB] != PricingPlan.NONE;
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes calldata
  ) external view returns (uint256 _amountOut) {
    (address _tokenA, address _tokenB) = _sortTokens(_tokenIn, _tokenOut);
    PricingPlan _plan = planForPair[_tokenA][_tokenB];
    if (_plan == PricingPlan.NONE) revert PairNotSupportedYet(_tokenA, _tokenB);

    int8 _inDecimals = _getDecimals(_tokenIn);
    int8 _outDecimals = _getDecimals(_tokenOut);

    if (_plan <= PricingPlan.TOKEN_ETH_PAIR) {
      return _getDirectPrice(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    } else if (_plan <= PricingPlan.TOKEN_TO_ETH_TO_TOKEN_PAIR) {
      return _getPriceSameBase(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    } else {
      return _getPriceDifferentBases(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    }
  }

  function _addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata
  ) internal virtual override {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    if (_plan == PricingPlan.NONE) {
      // Check if there is a current plan. If there is, it means that the pair was supported and it
      // lost support. In that case, we will remove the current plan and continue working as expected.
      // If there was no supported plan, and there still isn't, then we will fail
      PricingPlan _currentPlan = planForPair[__tokenA][__tokenB];
      if (_currentPlan == PricingPlan.NONE) {
        revert PairCannotBeSupported(_tokenA, _tokenB);
      }
    }
    planForPair[__tokenA][__tokenB] = _plan;
    emit UpdatedPlanForPair(__tokenA, __tokenB, _plan);
  }

  /// @inheritdoc IStatefulChainlinkOracle
  function addUSDStablecoins(address[] calldata _addresses) external onlyRole(ADMIN_ROLE) {
    for (uint256 i = 0; i < _addresses.length; i++) {
      _shouldBeConsideredUSD[_addresses[i]] = true;
    }
    emit TokensConsideredUSD(_addresses);
  }

  /// @inheritdoc IStatefulChainlinkOracle
  function removeUSDStablecoins(address[] calldata _addresses) external onlyRole(ADMIN_ROLE) {
    for (uint256 i = 0; i < _addresses.length; i++) {
      _shouldBeConsideredUSD[_addresses[i]] = false;
    }
    emit TokensNoLongerConsideredUSD(_addresses);
  }

  /// @inheritdoc IStatefulChainlinkOracle
  function addMappings(address[] calldata _addresses, address[] calldata _mappings) external onlyRole(ADMIN_ROLE) {
    if (_addresses.length != _mappings.length) revert InvalidMappingsInput();
    for (uint256 i = 0; i < _addresses.length; i++) {
      _tokenMappings[_addresses[i]] = _mappings[i];
    }
    emit MappingsAdded(_addresses, _mappings);
  }

  /// @inheritdoc IStatefulChainlinkOracle
  function setMaxDelay(uint32 _maxDelay) external onlyRole(ADMIN_ROLE) {
    maxDelay = _maxDelay;
    emit MaxDelaySet(_maxDelay);
  }

  /// @inheritdoc IStatefulChainlinkOracle
  function mappedToken(address _token) public view returns (address) {
    address _mapping = _tokenMappings[_token];
    return _mapping != address(0) ? _mapping : _token;
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 _interfaceId) public view override(AccessControl, BaseOracle) returns (bool) {
    return
      _interfaceId == type(IStatefulChainlinkOracle).interfaceId ||
      AccessControl.supportsInterface(_interfaceId) ||
      BaseOracle.supportsInterface(_interfaceId);
  }

  /** Handles prices when the pair is either ETH/USD, token/ETH or token/USD */
  function _getDirectPrice(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    uint256 _price;
    int8 _resultDecimals = _plan == PricingPlan.TOKEN_ETH_PAIR ? ETH_DECIMALS : USD_DECIMALS;
    bool _needsInverting = _isUSD(_tokenIn) || (_plan == PricingPlan.TOKEN_ETH_PAIR && _tokenIn == WETH);

    if (_plan == PricingPlan.ETH_USD_PAIR) {
      _price = _getETHUSD();
    } else if (_plan == PricingPlan.TOKEN_USD_PAIR) {
      _price = _getPriceAgainstUSD(_isUSD(_tokenOut) ? _tokenIn : _tokenOut);
    } else if (_plan == PricingPlan.TOKEN_ETH_PAIR) {
      _price = _getPriceAgainstETH(_tokenOut == WETH ? _tokenIn : _tokenOut);
    }
    if (!_needsInverting) {
      return _adjustDecimals(_price * _amountIn, _outDecimals - _resultDecimals - _inDecimals);
    } else {
      return _adjustDecimals(_adjustDecimals(_amountIn, _resultDecimals + _outDecimals) / _price, -_inDecimals);
    }
  }

  /** Handles prices when both tokens share the same base (either ETH or USD) */
  function _getPriceSameBase(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    address _base = _plan == PricingPlan.TOKEN_TO_USD_TO_TOKEN_PAIR ? Denominations.USD : Denominations.ETH;
    uint256 _tokenInToBase = _callRegistry(mappedToken(_tokenIn), _base);
    uint256 _tokenOutToBase = _callRegistry(mappedToken(_tokenOut), _base);
    return _adjustDecimals((_amountIn * _tokenInToBase) / _tokenOutToBase, _outDecimals - _inDecimals);
  }

  /** Handles prices when one of the tokens uses ETH as the base, and the other USD */
  function _getPriceDifferentBases(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    bool _isTokenInUSD = (_plan == PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B && _tokenIn < _tokenOut) ||
      (_plan == PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B && _tokenIn > _tokenOut);
    uint256 _ethToUSDPrice = _getETHUSD();
    if (_isTokenInUSD) {
      uint256 _tokenInToUSD = _getPriceAgainstUSD(_tokenIn);
      uint256 _tokenOutToETH = _getPriceAgainstETH(_tokenOut);
      uint256 _adjustedInUSDValue = _adjustDecimals(_amountIn * _tokenInToUSD, _outDecimals - _inDecimals + ETH_DECIMALS);
      return _adjustedInUSDValue / _ethToUSDPrice / _tokenOutToETH;
    } else {
      uint256 _tokenInToETH = _getPriceAgainstETH(_tokenIn);
      uint256 _tokenOutToUSD = _getPriceAgainstUSD(_tokenOut);
      return _adjustDecimals((_amountIn * _tokenInToETH * _ethToUSDPrice) / _tokenOutToUSD, _outDecimals - _inDecimals - ETH_DECIMALS);
    }
  }

  function _getPriceAgainstUSD(address _token) internal view returns (uint256) {
    return _isUSD(_token) ? 1e8 : _callRegistry(mappedToken(_token), Denominations.USD);
  }

  function _getPriceAgainstETH(address _token) internal view returns (uint256) {
    return _token == WETH ? 1e18 : _callRegistry(mappedToken(_token), Denominations.ETH);
  }

  function _determinePricingPlan(address _tokenA, address _tokenB) internal view virtual returns (PricingPlan) {
    bool _isTokenAUSD = _isUSD(_tokenA);
    bool _isTokenBUSD = _isUSD(_tokenB);
    bool _isTokenAETH = _tokenA == WETH;
    bool _isTokenBETH = _tokenB == WETH;
    if ((_isTokenAETH && _isTokenBUSD) || (_isTokenAUSD && _isTokenBETH)) {
      // Note: there are stablecoins/ETH pairs on Chainlink, but they are updated less often than the USD/ETH pair.
      // That's why we prefer to use the USD/ETH pair instead
      return PricingPlan.ETH_USD_PAIR;
    } else if (_isTokenBUSD && !_isTokenAUSD) {
      return _tryWithBases(_tokenA, PricingPlan.TOKEN_USD_PAIR, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B);
    } else if (_isTokenAUSD && !_isTokenBUSD) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_USD_PAIR, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B);
    } else if (_isTokenBETH) {
      return _tryWithBases(_tokenA, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B, PricingPlan.TOKEN_ETH_PAIR);
    } else if (_isTokenAETH) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B, PricingPlan.TOKEN_ETH_PAIR);
    } else if (_exists(_tokenA, Denominations.USD)) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_TO_USD_TO_TOKEN_PAIR, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B);
    } else if (_exists(_tokenA, Denominations.ETH)) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B, PricingPlan.TOKEN_TO_ETH_TO_TOKEN_PAIR);
    }
    return PricingPlan.NONE;
  }

  function _tryWithBases(
    address _token,
    PricingPlan _ifUSD,
    PricingPlan _ifETH
  ) internal view returns (PricingPlan) {
    // Note: we are prioritizing plans that have fewer external calls
    (address _firstBase, PricingPlan _firstResult, address _secondBaseBase, PricingPlan _secondResult) = _ifUSD < _ifETH
      ? (Denominations.USD, _ifUSD, Denominations.ETH, _ifETH)
      : (Denominations.ETH, _ifETH, Denominations.USD, _ifUSD);
    if (_exists(_token, _firstBase)) {
      return _firstResult;
    } else if (_exists(_token, _secondBaseBase)) {
      return _secondResult;
    } else {
      return PricingPlan.NONE;
    }
  }

  function _exists(address _base, address _quote) internal view returns (bool) {
    try registry.latestRoundData(mappedToken(_base), _quote) returns (uint80, int256 _price, uint256, uint256, uint80) {
      return _price > 0;
    } catch {
      return false;
    }
  }

  function _adjustDecimals(uint256 _amount, int256 _factor) internal pure returns (uint256) {
    if (_factor < 0) {
      return _amount / (10**uint256(-_factor));
    } else {
      return _amount * (10**uint256(_factor));
    }
  }

  function _getDecimals(address _token) internal view returns (int8) {
    return int8(IERC20Metadata(_token).decimals());
  }

  function _callRegistry(address _base, address _quote) internal view returns (uint256) {
    (, int256 _price, , uint256 _updatedAt, ) = registry.latestRoundData(_base, _quote);
    if (_price <= 0) revert InvalidPrice();
    if (maxDelay < block.timestamp && _updatedAt < block.timestamp - maxDelay) revert LastUpdateIsTooOld();
    return uint256(_price);
  }

  function _getETHUSD() internal view returns (uint256) {
    return _callRegistry(Denominations.ETH, Denominations.USD);
  }

  function _isUSD(address _token) internal view returns (bool) {
    return _shouldBeConsideredUSD[_token];
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
