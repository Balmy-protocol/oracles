// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/libraries/TokenSorting.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/oracles/IChainlinkOracle.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '../../interfaces/ITokenPriceOracle.sol';

/// @notice An adapter to make the stateful Chainlink oracle implement ITokenPriceOracle
contract StatefulChainlinkOracleAdapter is ITokenPriceOracle {
  using SafeCast for uint256;

  /// @notice Returns the address of the stateful Chainlink oracle
  /// @return The address of the stateful Chainlink oracle
  IChainlinkOracle public immutable CHAINLINK_ORACLE;

  constructor(IChainlinkOracle _chainlinkOracle) {
    CHAINLINK_ORACLE = _chainlinkOracle;
  }

  /// @inheritdoc ITokenPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    return CHAINLINK_ORACLE.canSupportPair(_tokenA, _tokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function isPairAlreadySupported(address _tokenA, address _tokenB) external view returns (bool) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return CHAINLINK_ORACLE.planForPair(__tokenA, __tokenB) != IChainlinkOracle.PricingPlan.NONE;
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) public view returns (uint256 _amountOut) {
    return CHAINLINK_ORACLE.quote(_tokenIn, _amountIn.toUint128(), _tokenOut);
  }

  /// @inheritdoc ITokenPriceOracle
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    bytes calldata
  ) external view returns (uint256 _amountOut) {
    return quote(_tokenIn, _amountIn, _tokenOut);
  }

  /// @inheritdoc ITokenPriceOracle
  function addOrModifySupportForPair(address _tokenA, address _tokenB) public {
    CHAINLINK_ORACLE.reconfigureSupportForPair(_tokenA, _tokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function addOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata
  ) external {
    addOrModifySupportForPair(_tokenA, _tokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) public {
    CHAINLINK_ORACLE.addSupportForPairIfNeeded(_tokenA, _tokenB);
  }

  /// @inheritdoc ITokenPriceOracle
  function addSupportForPairIfNeeded(
    address _tokenA,
    address _tokenB,
    bytes calldata
  ) external {
    addSupportForPairIfNeeded(_tokenA, _tokenB);
  }
}
