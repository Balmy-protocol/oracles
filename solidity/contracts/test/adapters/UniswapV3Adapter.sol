// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../adapters/UniswapV3Adapter.sol';

contract UniswapV3AdapterMock is UniswapV3Adapter {
  constructor(InitialConfig memory _initialConfig) UniswapV3Adapter(_initialConfig) {}

  function internalAddOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    _addOrModifySupportForPair(_tokenA, _tokenB, _data);
  }

  function setPools(
    address _tokenA,
    address _tokenB,
    address[] calldata _pools
  ) external {
    address[] storage _storagePools = _poolsForPair[_keyForPair(_tokenA, _tokenB)];
    for (uint256 i; i < _pools.length; i++) {
      _storagePools.push(_pools[i]);
    }
  }
}
