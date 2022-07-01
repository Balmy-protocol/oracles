// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../TransformerOracle.sol';

contract TransformerOracleMock is TransformerOracle {
  mapping(address => mapping(address => address[])) internal _mappingForPair;

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

  function getMappingForPair(address _tokenA, address _tokenB) public view override returns (address _mappedTokenA, address _mappedTokenB) {
    address[] memory _mapping = _mappingForPair[_tokenA][_tokenB];
    if (_mapping.length == 0) {
      return super.getMappingForPair(_tokenA, _tokenB);
    } else {
      return (_mapping[0], _mapping[1]);
    }
  }
}
