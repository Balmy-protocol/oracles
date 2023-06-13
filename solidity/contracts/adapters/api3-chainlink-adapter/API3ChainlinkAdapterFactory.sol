// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './API3ChainlinkAdapter.sol';

contract API3ChainlinkAdapterFactory {
  /// @notice Emitted when a new adapter is deployed
  event AdapterCreated(API3ChainlinkAdapter adapter);

  function createAdapter(IProxy _api3Proxy, string calldata _description) external returns (API3ChainlinkAdapter _adapter) {
    _adapter = new API3ChainlinkAdapter{salt: bytes32(0)}(_api3Proxy, _description);
    emit AdapterCreated(_adapter);
  }

  function computeAdapterAddress(IProxy _api3Proxy, string calldata _description) external view returns (address _adapter) {
    return
      _computeCreate2Address(
        keccak256(
          abi.encodePacked(
            // Deployment bytecode:
            type(API3ChainlinkAdapter).creationCode,
            // Constructor arguments:
            abi.encode(_api3Proxy, _description)
          )
        )
      );
  }

  function _computeCreate2Address(bytes32 _bytecodeHash) internal view virtual returns (address) {
    // Prefix:
    // Creator:
    // Salt:
    // Bytecode hash:
    return fromLast20Bytes(keccak256(abi.encodePacked(bytes1(0xFF), address(this), bytes32(0), _bytecodeHash)));
  }

  function fromLast20Bytes(bytes32 _bytesValue) internal pure returns (address) {
    // Convert the CREATE2 hash into an address.
    return address(uint160(uint256(_bytesValue)));
  }
}
