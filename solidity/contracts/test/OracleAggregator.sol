// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../OracleAggregator.sol';

contract OracleAggregatorMock is OracleAggregator {
  mapping(address => mapping(address => bool)) public internalAddOrModifyCalled;

  constructor(
    IPriceOracle[] memory _initialOracles,
    address _superAdmin,
    address[] memory _initialAdmins
  ) OracleAggregator(_initialOracles, _superAdmin, _initialAdmins) {}

  function internalAddOrModifySupportForPair(address _tokenA, address _tokenB) external {
    _addOrModifySupportForPair(_tokenA, _tokenB);
  }

  function _addOrModifySupportForPair(address _tokenA, address _tokenB) internal override {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    internalAddOrModifyCalled[__tokenA][__tokenB] = true;
    super._addOrModifySupportForPair(_tokenA, _tokenB);
  }
}
