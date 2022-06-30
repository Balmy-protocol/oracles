// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../base/SimpleOracle.sol';

contract SimpleOracleMock is SimpleOracle {
  error NotImplemented();

  struct InternalAddSupportCall {
    address tokenA;
    address tokenB;
    bytes data;
  }

  mapping(address => mapping(address => bool)) private _isPairAlreadySupported;
  InternalAddSupportCall public lastCall;

  function canSupportPair(address, address) external pure returns (bool) {
    revert NotImplemented();
  }

  function isPairAlreadySupported(address _tokenA, address _tokenB) public view override returns (bool) {
    return _isPairAlreadySupported[_tokenA][_tokenB];
  }

  function quote(
    address,
    uint256,
    address,
    bytes calldata
  ) external pure returns (uint256) {
    revert NotImplemented();
  }

  function _addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) internal override {
    require(lastCall.tokenA == address(0), 'Already called');
    lastCall = InternalAddSupportCall(_tokenA, _tokenB, _data);
  }

  function setPairAlreadySupported(address _tokenA, address _tokenB) external {
    _isPairAlreadySupported[_tokenA][_tokenB] = true;
  }
}
