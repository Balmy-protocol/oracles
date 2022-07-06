// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

contract UniswapV3PoolMock {
  uint32 public immutable gasPerCardinality;

  constructor(uint32 _gasPerCardinality) {
    gasPerCardinality = _gasPerCardinality;
  }

  function increaseObservationCardinalityNext(uint16 _observationCardinalityNext) external view {
    _burnGas(_observationCardinalityNext * gasPerCardinality);
  }

  function _burnGas(uint256 _amountToBurn) internal view {
    assembly {
      let ptr := mload(0x40)
      mstore(ptr, shl(224, _amountToBurn))
      let success := staticcall(gas(), 9, ptr, 213, 0, 0)
      if iszero(success) {
        revert(0, 0)
      }
    }
  }

  function slot0()
    external
    view
    returns (
      uint160 sqrtPriceX96,
      int24 tick,
      uint16 observationIndex,
      uint16 observationCardinality,
      uint16 observationCardinalityNext,
      uint8 feeProtocol,
      bool unlocked
    )
  {}
}
