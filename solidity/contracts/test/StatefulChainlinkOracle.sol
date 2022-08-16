// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../StatefulChainlinkOracle.sol';

contract StatefulChainlinkOracleMock is StatefulChainlinkOracle {
  struct MockedPricingPlan {
    PricingPlan plan;
    bool isSet;
  }

  mapping(address => mapping(address => MockedPricingPlan)) private _pricingPlan;

  constructor(
    FeedRegistryInterface _registry,
    uint32 _maxDelay,
    address _superAdmin,
    address[] memory _initialAdmins
  ) StatefulChainlinkOracle(_registry, _maxDelay, _superAdmin, _initialAdmins) {}

  function internalAddOrModifySupportForPair(
    address _tokenA,
    address _tokenB,
    bytes calldata _data
  ) external {
    _addOrModifySupportForPair(_tokenA, _tokenB, _data);
  }

  function determinePricingPlan(
    address _tokenA,
    address _tokenB,
    PricingPlan _plan
  ) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _pricingPlan[__tokenA][__tokenB] = MockedPricingPlan({plan: _plan, isSet: true});
  }

  function intercalCallRegistry(address _quote, address _base) external view returns (uint256) {
    return _callRegistry(_quote, _base);
  }

  function setPlanForPair(
    address _tokenA,
    address _tokenB,
    PricingPlan _plan
  ) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _planForPair[_keyForSortedPair(__tokenA, __tokenB)] = _plan;
  }

  function _determinePricingPlan(address _tokenA, address _tokenB) internal view override returns (PricingPlan) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    MockedPricingPlan memory _plan = _pricingPlan[__tokenA][__tokenB];
    if (_plan.isSet) {
      return _plan.plan;
    } else {
      return super._determinePricingPlan(__tokenA, __tokenB);
    }
  }
}
