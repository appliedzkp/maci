pragma experimental ABIEncoderV2;
pragma solidity ^0.5.0;

import { Hasher } from "./Hasher.sol";
import { MACISharedObjs } from "./MACISharedObjs.sol";

contract DomainObjs is Hasher, MACISharedObjs {
    struct StateLeaf {
        PubKey pubKey;
        uint256 voteOptionTreeRoot;
        uint256 voiceCreditBalance;
        uint256 nonce;
    }

    function hashStateLeaf(StateLeaf memory _stateLeaf) public pure returns (uint256) {
        uint256[] memory plaintext = new uint256[](5);
        plaintext[0] = _stateLeaf.pubKey.x;
        plaintext[1] = _stateLeaf.pubKey.y;
        plaintext[2] = _stateLeaf.voteOptionTreeRoot;
        plaintext[3] = _stateLeaf.voiceCreditBalance;
        plaintext[4] = _stateLeaf.nonce;

        return hash5(plaintext);
    }

    function hashMessage(Message memory _message) public pure returns (uint256) {
        uint256[] memory plaintext = new uint256[](MESSAGE_DATA_LENGTH + 1);

        plaintext[0] = _message.iv;

        for (uint8 i=0; i < MESSAGE_DATA_LENGTH; i++) {
            plaintext[i+1] = _message.data[i];
        }

        return hash11(plaintext);
    }
}
