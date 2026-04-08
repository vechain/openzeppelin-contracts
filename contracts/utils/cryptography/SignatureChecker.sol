// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/cryptography/SignatureChecker.sol)

pragma solidity ^0.8.20;

import {ECDSA} from "./ECDSA.sol";
import {IERC1271} from "../../interfaces/IERC1271.sol";
import {IERC7913SignatureVerifier} from "../../interfaces/IERC7913.sol";
import {Bytes} from "../Bytes.sol";

/**
 * @dev Signature verification helper that can be used instead of `ECDSA.recover` to seamlessly support both ECDSA
 * signatures from externally owned accounts (EOAs) as well as ERC1271 signatures from smart contract wallets like
 * Argent and Safe Wallet (previously Gnosis Safe).
 */
library SignatureChecker {
    using Bytes for bytes;
    /**
     * @dev Checks if a signature is valid for a given signer and data hash. If the signer is a smart contract, the
     * signature is validated against that smart contract using ERC1271, otherwise it's validated using `ECDSA.recover`.
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     */
    function isValidSignatureNow(address signer, bytes32 hash, bytes memory signature) internal view returns (bool) {
        (address recovered, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hash, signature);
        return
            (error == ECDSA.RecoverError.NoError && recovered == signer) ||
            isValidERC1271SignatureNow(signer, hash, signature);
    }

    /**
     * @dev Checks if a signature is valid for a given signer and data hash. The signature is validated
     * against the signer smart contract using ERC-1271.
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     */
    function isValidERC1271SignatureNow(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool result) {
        bytes4 selector = IERC1271.isValidSignature.selector;
        uint256 length = signature.length;

        assembly ("memory-safe") {
            // Encoded calldata is :
            // [ 0x00 - 0x03 ] <selector>
            // [ 0x04 - 0x23 ] <hash>
            // [ 0x24 - 0x43 ] <signature offset> (0x40)
            // [ 0x44 - 0x63 ] <signature length>
            // [ 0x64 - ...  ] <signature data>
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mcopy(add(ptr, 0x44), signature, add(length, 0x20))

            let success := staticcall(gas(), signer, ptr, add(length, 0x64), 0x00, 0x20)
            result := and(success, and(gt(returndatasize(), 0x1f), eq(mload(0x00), selector)))
        }
    }

    /**
     * @dev Verifies a signature for a given ERC-7913 signer and hash.
     *
     * The signer is a `bytes` object that is the concatenation of an address and optionally a key:
     * `verifier || key`. A signer must be at least 20 bytes long.
     *
     * * If `signer.length < 20`: verification fails
     * * If `signer.length == 20`: verification is done using {isValidSignatureNow}
     * * Otherwise: verification is done using {IERC7913SignatureVerifier}
     */
    function isValidSignatureNow(
        bytes memory signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool) {
        if (signer.length < 20) {
            return false;
        } else if (signer.length == 20) {
            return isValidSignatureNow(address(bytes20(signer)), hash, signature);
        } else {
            (bool success, bytes memory result) = address(bytes20(signer)).staticcall(
                abi.encodeCall(IERC7913SignatureVerifier.verify, (signer.slice(20, signer.length), hash, signature))
            );
            return (success &&
                result.length >= 32 &&
                abi.decode(result, (bytes32)) == bytes32(IERC7913SignatureVerifier.verify.selector));
        }
    }

    /**
     * @dev Verifies multiple ERC-7913 `signatures` for a given `hash` using a set of `signers`.
     * Returns `false` if the number of signers and signatures is not the same.
     *
     * The signers should be ordered by their `keccak256` hash to ensure efficient duplication check.
     */
    function areValidSignaturesNow(
        bytes32 hash,
        bytes[] memory signers,
        bytes[] memory signatures
    ) internal view returns (bool) {
        if (signers.length != signatures.length) return false;

        bytes32 lastId = bytes32(0);

        for (uint256 i = 0; i < signers.length; ++i) {
            bytes memory signer = signers[i];

            if (!isValidSignatureNow(signer, hash, signatures[i])) return false;

            bytes32 id = keccak256(signer);
            if (lastId < id) {
                lastId = id;
            } else {
                for (uint256 j = 0; j < i; ++j) {
                    if (id == keccak256(signers[j])) return false;
                }
            }
        }

        return true;
    }
}
