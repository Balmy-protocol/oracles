// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../TransformerOracle.sol';

contract TransformerOracleMock is TransformerOracle {
  mapping(address => mapping(address => address[])) internal _underlyingPair;

  constructor(ITransformerRegistry _registry, ITokenPriceOracle _underlyingOracle) TransformerOracle(_registry, _underlyingOracle) {}

  function setUnderlying(
    address _tokenA,
    address _tokenB,
    address _underlyingTokenA,
    address _underlyingTokenB
  ) external {
    _underlyingPair[_tokenA][_tokenB].push(_underlyingTokenA);
    _underlyingPair[_tokenA][_tokenB].push(_underlyingTokenB);
  }

  function mapPairToUnderlying(address _tokenA, address _tokenB)
    public
    view
    override
    returns (address _underlyingTokenA, address _underlyingTokenB)
  {
    address[] memory _underlying = _underlyingPair[_tokenA][_tokenB];
    if (_underlying.length == 0) {
      return super.mapPairToUnderlying(_tokenA, _tokenB);
    } else {
      return (_underlying[0], _underlying[1]);
    }
  }
}
