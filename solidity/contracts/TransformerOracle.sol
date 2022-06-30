// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './base/BaseOracle.sol';
import '../interfaces/ITransformerOracle.sol';

/**
 * @notice This implementation of `ITransformerOracle` assumes that all tokens being transformed only have one underlying token.
 *         This is true when this implementation was writter, but it may not be true in the future. If that happens, then another
 *         implementation will be needed
 */
contract TransformerOracle is BaseOracle, ITransformerOracle {
  /// @inheritdoc ITransformerOracle
  ITransformerRegistry public immutable REGISTRY;

  /// @inheritdoc ITransformerOracle
  ITokenPriceOracle public immutable UNDERLYING_ORACLE;

  constructor(ITransformerRegistry _registry, ITokenPriceOracle _underlyingOracle) {
    if (address(_registry) == address(0) || address(_underlyingOracle) == address(0)) revert ZeroAddress();
    REGISTRY = _registry;
    UNDERLYING_ORACLE = _underlyingOracle;
  }

  /// @inheritdoc ITransformerOracle
  function mapPairToUnderlying(address _tokenA, address _tokenB)
    public
    view
    virtual
    returns (address _underlyingTokenA, address _underlyingTokenB)
  {
    address[] memory _tokens = new address[](2);
    _tokens[0] = _tokenA;
    _tokens[1] = _tokenB;
    ITransformer[] memory _transformers = REGISTRY.transformers(_tokens);
    _underlyingTokenA = _mapToUnderlyingIfExists(_tokenA, _transformers[0]);
    _underlyingTokenB = _mapToUnderlyingIfExists(_tokenB, _transformers[1]);
  }

  /// @inheritdoc ITokenPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    (address _underlyingTokenA, address _underlyingTokenB) = mapPairToUnderlying(_tokenA, _tokenB);
    return UNDERLYING_ORACLE.canSupportPair(_underlyingTokenA, _underlyingTokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) external view returns (bool) {
    (address _underlyingTokenA, address _underlyingTokenB) = mapPairToUnderlying(_tokenA, _tokenB);
    return UNDERLYING_ORACLE.isPairAlreadySupported(_underlyingTokenA, _underlyingTokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes calldata _data
  ) external view returns (uint256 _amountOut) {
    // TODO: Implement
  }

  /// @inheritdoc ITokenPriceOracle
  function addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    (address _underlyingTokenA, address _underlyingTokenB) = mapPairToUnderlying(_tokenA, _tokenB);
    UNDERLYING_ORACLE.addOrModifySupportForPair(_underlyingTokenA, _underlyingTokenB, _data);
  }

  /// @inheritdoc ITokenPriceOracle
  function addSupportForPairIfNeeded(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    (address _underlyingTokenA, address _underlyingTokenB) = mapPairToUnderlying(_tokenA, _tokenB);
    UNDERLYING_ORACLE.addSupportForPairIfNeeded(_underlyingTokenA, _underlyingTokenB, _data);
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 _interfaceId) public view override returns (bool) {
    return _interfaceId == type(ITransformerOracle).interfaceId || super.supportsInterface(_interfaceId);
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
}
