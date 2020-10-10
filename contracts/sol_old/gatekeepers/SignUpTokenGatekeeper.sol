pragma solidity ^0.5.0;

import { SignUpGatekeeper } from './SignUpGatekeeper.sol';
import { SignUpToken } from '../SignUpToken.sol';

contract SignUpTokenGatekeeper is SignUpGatekeeper {

    SignUpToken token;

    mapping (uint256 => bool) internal registeredTokenIds;

    constructor(SignUpToken _token) public {
        token = _token;
    }

    /*
     * Registers the user if they own the token with the token ID encoded in
     * _data. Throws if the user is does not own the token or if the token has
     * already been used to sign up.
     * @param _user The user's Ethereum address.
     * @param _data The ABI-encoded tokenId as a uint256.
     */
    function register(address _user, bytes memory _data) public {
        // Decode the given _data bytes into a uint256 which is the token ID
        uint256 tokenId = abi.decode(_data, (uint256));
        
        // Check if the user owns the token
        bool ownsToken = token.ownerOf(tokenId) == _user;
        require(ownsToken == true, "SignUpTokenGatekeeper: this user does not own the token");

        // Check if the token has already been used
        bool alreadyRegistered = registeredTokenIds[tokenId];
        require(alreadyRegistered == false, "SignUpTokenGatekeeper: this token has already been used to sign up");

        // Mark the token as already used
        registeredTokenIds[tokenId] = true;
    }
}
