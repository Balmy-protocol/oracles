// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../adapters/UniswapV3Adapter.sol';

contract UniswapV3AdapterMock is UniswapV3Adapter {
  constructor(InitialConfig memory _initialConfig) UniswapV3Adapter(_initialConfig) {}

  mapping(address => mapping(address => address[])) private _allPoolsSorted;
  bool _sortedPoolsSet;

  function internalAddOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    _addOrModifySupportForPair(_tokenA, _tokenB, _data);
  }

  function internalGetAllPoolsSortedByLiquidity(address _tokenA, address _tokenB) external view returns (address[] memory) {
    return _getAllPoolsSortedByLiquidity(_tokenA, _tokenB);
  }

  function _getAllPoolsSortedByLiquidity(address _tokenA, address _tokenB) internal view override returns (address[] memory _pools) {
    if (_sortedPoolsSet) {
      return _allPoolsSorted[_tokenA][_tokenB];
    } else {
      return super._getAllPoolsSortedByLiquidity(_tokenA, _tokenB);
    }
  }

  function setAvailablePools(
    address _tokenA,
    address _tokenB,
    address[] calldata _available
  ) external {
    delete _allPoolsSorted[_tokenA][_tokenB];
    for (uint256 i = 0; i < _available.length; i++) {
      _allPoolsSorted[_tokenA][_tokenB].push(_available[i]);
    }
    _sortedPoolsSet = true;
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
