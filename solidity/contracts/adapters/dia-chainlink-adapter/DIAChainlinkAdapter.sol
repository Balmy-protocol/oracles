// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol';

interface IDIAOracleV2 {
  function getValue(string memory key) external view returns (uint128, uint128);
}

contract DIAChainlinkAdapter is AggregatorV2V3Interface {
  /// @notice Thrown when trying to query a round that is not the latest one
  error OnlyLatestRoundIsAvailable();
  error NotImplemented();

  /// @notice The address of the underlying DIA Oracle
  address public immutable DIA_ORACLE;
  uint8 public immutable decimals;
  string public description;

  /// @notice The round number we'll use to represent the latest round
  uint80 internal constant LATEST_ROUND = 0;

  /// @notice Magnitude to convert DIA values to Chainlink values
  uint256 internal immutable _magnitudeConversion;

  bool internal immutable _decimalsGreaterThanOracle;

  constructor(
    address _diaOracle,
    uint8 _oracleDecimals,
    uint8 _decimals,
    string memory _description
  ) {
    DIA_ORACLE = _diaOracle;
    decimals = _decimals;
    description = _description;
    _decimalsGreaterThanOracle = decimals > _oracleDecimals;
    _magnitudeConversion = 10**(_decimalsGreaterThanOracle ? _decimals - _oracleDecimals : _oracleDecimals - _decimals);
  }

  function version() external pure returns (uint256) {
    revert NotImplemented();
  }

  function getRoundData(uint80 __roundId)
    external
    view
    returns (
      uint80 _roundId,
      int256 _answer,
      uint256 _startedAt,
      uint256 _updatedAt,
      uint80 _answeredInRound
    )
  {
    if (__roundId != LATEST_ROUND) revert OnlyLatestRoundIsAvailable();
    return latestRoundData();
  }

  function latestRoundData()
    public
    view
    returns (
      uint80 _roundId,
      int256 _answer,
      uint256 _startedAt,
      uint256 _updatedAt,
      uint80 _answeredInRound
    )
  {
    (_answer, _updatedAt) = _read();
    _roundId = _answeredInRound = LATEST_ROUND;
    _startedAt = _updatedAt;
  }

  function latestAnswer() public view returns (int256 _value) {
    (_value, ) = _read();
  }

  function latestTimestamp() public view returns (uint256 _timestamp) {
    (, _timestamp) = _read();
  }

  function latestRound() external pure returns (uint256) {
    return LATEST_ROUND;
  }

  function getAnswer(uint256 _roundId) external view returns (int256) {
    if (_roundId != LATEST_ROUND) revert OnlyLatestRoundIsAvailable();
    return latestAnswer();
  }

  function getTimestamp(uint256 _roundId) external view returns (uint256) {
    if (_roundId != LATEST_ROUND) revert OnlyLatestRoundIsAvailable();
    return latestTimestamp();
  }

  function _read() internal view returns (int256 _value, uint256 _timestamp) {
    (uint128 value, uint128 timestamp) = IDIAOracleV2(DIA_ORACLE).getValue(description);
    unchecked {
      _value = _decimalsGreaterThanOracle
        ? (int256(int128(value)) * int256(_magnitudeConversion))
        : (int256(int128(value)) / int256(_magnitudeConversion));
      _timestamp = uint256(timestamp);
    }
  }
}
