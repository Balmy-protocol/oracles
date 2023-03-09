// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../TransformerOracle.sol';

contract TransformerOracleMock is TransformerOracle {
  mapping(address => mapping(address => address[])) internal _mappingForPair;
  mapping(address => mapping(address => ITransformer[])) internal _transformersForPair;

  constructor(
    ITransformerRegistry _registry,
    ITokenPriceOracle _underlyingOracle,
    address _superAdmin,
    address[] memory _initialAdmins
  ) TransformerOracle(_registry, _underlyingOracle, _superAdmin, _initialAdmins) {}

  function setMappingForPair(
    address _tokenA,
    address _tokenB,
    address _mappedTokenA,
    address _mappedTokenB
  ) external {
    _mappingForPair[_tokenA][_tokenB].push(_mappedTokenA);
    _mappingForPair[_tokenA][_tokenB].push(_mappedTokenB);
  }

  function setTransformersForPair(
    address _tokenA,
    address _tokenB,
    ITransformer _transformerTokenA,
    ITransformer _transformerTokenB
  ) external {
    _transformersForPair[_tokenA][_tokenB] = [_transformerTokenA, _transformerTokenB];
  }

  function internalFetchTransformers(
    address _tokenA,
    address _tokenB,
    bool _shouldCheckA,
    bool _shouldCheckB
  ) external view returns (ITransformer _transformerTokenA, ITransformer _transformerTokenB) {
    return _fetchTransformers(_tokenA, _tokenB, _shouldCheckA, _shouldCheckB);
  }

  function internalHideTransformersBasedOnConfig(
    address _tokenA,
    address _tokenB,
    ITransformer _transformerTokenA,
    ITransformer _transformerTokenB
  ) external view returns (ITransformer, ITransformer) {
    return _hideTransformersBasedOnConfig(_tokenA, _tokenB, _transformerTokenA, _transformerTokenB);
  }

  function _getTransformers(
    address _tokenA,
    address _tokenB,
    bool _shouldCheckA,
    bool _shouldCheckB
  ) internal view override returns (ITransformer _transformerTokenA, ITransformer _transformerTokenB) {
    ITransformer[] memory _transformers = _transformersForPair[_tokenA][_tokenB];
    if (_transformers.length > 0) {
      return (_transformers[0], _transformers[1]);
    } else {
      return super._getTransformers(_tokenA, _tokenB, _shouldCheckA, _shouldCheckB);
    }
  }

  function getMappingForPair(address _tokenA, address _tokenB) public view override returns (address _mappedTokenA, address _mappedTokenB) {
    address[] memory _mapping = _mappingForPair[_tokenA][_tokenB];
    if (_mapping.length == 0) {
      return super.getMappingForPair(_tokenA, _tokenB);
    } else {
      return (_mapping[0], _mapping[1]);
    }
  }

  function getRecursiveMappingForPair(address _tokenA, address _tokenB)
    public
    view
    override
    returns (address _mappedTokenA, address _mappedTokenB)
  {
    address[] memory _mapping = _mappingForPair[_tokenA][_tokenB];
    if (_mapping.length == 0) {
      return super.getRecursiveMappingForPair(_tokenA, _tokenB);
    } else {
      return (_mapping[0], _mapping[1]);
    }
  }
}
