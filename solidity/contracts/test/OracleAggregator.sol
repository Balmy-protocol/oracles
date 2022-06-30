// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../OracleAggregator.sol';

contract OracleAggregatorMock is OracleAggregator {
  struct InternalCall {
    bool wasCalled;
    bytes data;
  }

  mapping(address => mapping(address => InternalCall)) public internalAddOrModifyCalled;

  constructor(
    address[] memory _initialOracles,
    address _superAdmin,
    address[] memory _initialAdmins
  ) OracleAggregator(_initialOracles, _superAdmin, _initialAdmins) {}

  function internalAddOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    _addOrModifySupportForPair(_tokenA, _tokenB, _data);
  }

  function setOracle(
    address _tokenA,
    address _tokenB,
    ITokenPriceOracle _oracle,
    bool _forced
  ) external {
    _assignedOracle[_keyForPair(_tokenA, _tokenB)] = OracleAssignment({oracle: _oracle, forced: _forced});
  }

  function _addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) internal override {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    internalAddOrModifyCalled[__tokenA][__tokenB] = InternalCall({wasCalled: true, data: _data});
    super._addOrModifySupportForPair(_tokenA, _tokenB, _data);
  }
}
