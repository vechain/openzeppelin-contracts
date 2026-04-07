// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Helper contract for batching multiple calls in a single transaction.
/// Used in ERC20TemporaryApproval tests to simulate batched ERC-7579-style calls.
contract BatchCaller {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    function execute(Call[] calldata calls) external payable {
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            require(success, "BatchCaller: call failed");
        }
    }
}
