// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import './libraries/TokenSorting.sol';
import './base/BaseOracle.sol';
import '../interfaces/ITransformerOracle.sol';

/**
 * @notice This implementation of `ITransformerOracle` assumes that all tokens being transformed only have one underlying token.
 *         This is true when this implementation was written, but it may not be true in the future. If that happens, then another
 *         implementation will be needed
 */
contract TransformerOracle is BaseOracle, AccessControl, ITransformerOracle {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  /// @inheritdoc ITransformerOracle
  ITransformerRegistry public immutable REGISTRY;

  /// @inheritdoc ITransformerOracle
  ITokenPriceOracle public immutable UNDERLYING_ORACLE;

  /// @inheritdoc ITransformerOracle
  mapping(address => bool) public willAvoidMappingToUnderlying;
  mapping(bytes32 => PairSpecificMappingConfig) internal _pairSpecificMappingConfig;

  constructor(
    ITransformerRegistry _registry,
    ITokenPriceOracle _underlyingOracle,
    address _superAdmin,
    address[] memory _initialAdmins
  ) {
    if (address(_registry) == address(0) || address(_underlyingOracle) == address(0) || _superAdmin == address(0)) revert ZeroAddress();
    REGISTRY = _registry;
    UNDERLYING_ORACLE = _underlyingOracle;
    // We are setting the super admin role as its own admin so we can transfer it
    _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);
    for (uint256 i; i < _initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
    }
  }

  /// @inheritdoc ITransformerOracle
  function getMappingForPair(address _tokenA, address _tokenB) public view virtual returns (address _mappedTokenA, address _mappedTokenB) {
    (ITransformer _transformerTokenA, ITransformer _transformerTokenB) = _getTransformers(_tokenA, _tokenB);
    _mappedTokenA = _mapToUnderlyingIfExists(_tokenA, _transformerTokenA);
    _mappedTokenB = _mapToUnderlyingIfExists(_tokenB, _transformerTokenB);
  }

  /// @inheritdoc ITransformerOracle
  function pairSpecificMappingConfig(address _tokenA, address _tokenB) public view virtual returns (PairSpecificMappingConfig memory) {
    return _pairSpecificMappingConfig[_keyForPair(_tokenA, _tokenB)];
  }

  /// @inheritdoc ITransformerOracle
  function shouldMapToUnderlying(address[] calldata _dependents) external onlyRole(ADMIN_ROLE) {
    for (uint256 i; i < _dependents.length; i++) {
      willAvoidMappingToUnderlying[_dependents[i]] = false;
    }
    emit DependentsWillMapToUnderlying(_dependents);
  }

  /// @inheritdoc ITransformerOracle
  function avoidMappingToUnderlying(address[] calldata _dependents) external onlyRole(ADMIN_ROLE) {
    for (uint256 i; i < _dependents.length; i++) {
      willAvoidMappingToUnderlying[_dependents[i]] = true;
    }
    emit DependentsWillAvoidMappingToUnderlying(_dependents);
  }

  /// @inheritdoc ITransformerOracle
  function setPairSpecificMappingConfig(PairSpecificMappingConfigToSet[] calldata _config) external onlyRole(ADMIN_ROLE) {
    for (uint256 i = 0; i < _config.length; ) {
      PairSpecificMappingConfigToSet memory _pairConfigToSet = _config[i];
      // We make sure that the tokens are sorted correctly, of we reverse the config so that it ends up sorted
      (bytes32 _key, bool _mapTokenAToUnderlying, bool _mapTokenBToUnderlying) = _pairConfigToSet.tokenA < _pairConfigToSet.tokenB
        ? (
          _keyForSortedPair(_pairConfigToSet.tokenA, _pairConfigToSet.tokenB),
          _pairConfigToSet.mapTokenAToUnderlying,
          _pairConfigToSet.mapTokenBToUnderlying
        )
        : (
          _keyForSortedPair(_pairConfigToSet.tokenB, _pairConfigToSet.tokenA),
          _pairConfigToSet.mapTokenBToUnderlying,
          _pairConfigToSet.mapTokenAToUnderlying
        );
      _pairSpecificMappingConfig[_key] = PairSpecificMappingConfig(_mapTokenAToUnderlying, _mapTokenBToUnderlying, true);
      unchecked {
        i++;
      }
    }
    emit PairSpecificConfigSet(_config);
  }

  /// @inheritdoc ITokenPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    (address _mappedTokenA, address _mappedTokenB) = getMappingForPair(_tokenA, _tokenB);
    return UNDERLYING_ORACLE.canSupportPair(_mappedTokenA, _mappedTokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) external view returns (bool) {
    (address _mappedTokenA, address _mappedTokenB) = getMappingForPair(_tokenA, _tokenB);
    return UNDERLYING_ORACLE.isPairAlreadySupported(_mappedTokenA, _mappedTokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes calldata _data
  ) external view returns (uint256 _amountOut) {
    (ITransformer _transformerTokenIn, ITransformer _transformerTokenOut) = _getTransformers(_tokenIn, _tokenOut);

    if (address(_transformerTokenIn) != address(0)) {
      // If token in has a transformer, then calculate how much amount it would be in underlying, and calculate the quote for that
      ITransformer.UnderlyingAmount[] memory _transformedIn = _transformerTokenIn.calculateTransformToUnderlying(_tokenIn, _amountIn);
      _tokenIn = _transformedIn[0].underlying;
      _amountIn = _transformedIn[0].amount;
    }

    if (address(_transformerTokenOut) != address(0)) {
      // If token out has a transformer, then calculate the quote for the underlying and then transform the result
      address[] memory _underlyingOut = _transformerTokenOut.getUnderlying(_tokenOut);
      uint256 _amountOutUnderlying = UNDERLYING_ORACLE.quote(_tokenIn, _amountIn, _underlyingOut[0], _data);
      return _transformerTokenOut.calculateTransformToDependent(_tokenOut, _toUnderlyingAmount(_underlyingOut[0], _amountOutUnderlying));
    }

    return UNDERLYING_ORACLE.quote(_tokenIn, _amountIn, _tokenOut, _data);
  }

  /// @inheritdoc ITokenPriceOracle
  function addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    (address _mappedTokenA, address _mappedTokenB) = getMappingForPair(_tokenA, _tokenB);
    UNDERLYING_ORACLE.addOrModifySupportForPair(_mappedTokenA, _mappedTokenB, _data);
  }

  /// @inheritdoc ITokenPriceOracle
  function addSupportForPairIfNeeded(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    (address _mappedTokenA, address _mappedTokenB) = getMappingForPair(_tokenA, _tokenB);
    UNDERLYING_ORACLE.addSupportForPairIfNeeded(_mappedTokenA, _mappedTokenB, _data);
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 _interfaceId) public view override(AccessControl, BaseOracle) returns (bool) {
    return
      _interfaceId == type(ITransformerOracle).interfaceId ||
      AccessControl.supportsInterface(_interfaceId) ||
      BaseOracle.supportsInterface(_interfaceId);
  }

  /**
   * @notice Takes a token and a associated transformer (could not exist). If the transformer exists, this
   *         function will return the underlying token. If it doesn't exist, then it will return the given token
   */
  function _mapToUnderlyingIfExists(address _token, ITransformer _transformer) internal view returns (address) {
    if (address(_transformer) == address(0)) {
      return _token;
    }
    address[] memory _underlying = _transformer.getUnderlying(_token);
    return _underlying[0];
  }

  function _getTransformers(address _tokenA, address _tokenB)
    internal
    view
    virtual
    returns (ITransformer _transformerTokenA, ITransformer _transformerTokenB)
  {
    address[] memory _tokens = new address[](2);
    _tokens[0] = _tokenA;
    _tokens[1] = _tokenB;
    ITransformer[] memory _transformers = REGISTRY.transformers(_tokens);
    _transformerTokenA = _transformers[0];
    _transformerTokenB = _transformers[1];

    if (address(_transformerTokenA) != address(0) && willAvoidMappingToUnderlying[_tokenA]) {
      _transformerTokenA = ITransformer(address(0));
    }

    if (address(_transformerTokenB) != address(0) && willAvoidMappingToUnderlying[_tokenB]) {
      _transformerTokenB = ITransformer(address(0));
    }
  }

  function _toUnderlyingAmount(address _underlying, uint256 _amount)
    internal
    pure
    returns (ITransformer.UnderlyingAmount[] memory _underlyingAmount)
  {
    _underlyingAmount = new ITransformer.UnderlyingAmount[](1);
    _underlyingAmount[0].underlying = _underlying;
    _underlyingAmount[0].amount = _amount;
  }

  function _keyForPair(address _tokenA, address _tokenB) internal pure returns (bytes32) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _keyForSortedPair(__tokenA, __tokenB);
  }

  function _keyForSortedPair(address _tokenA, address _tokenB) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_tokenA, _tokenB));
  }
}
