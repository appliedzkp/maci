pragma solidity ^0.5.0;

import { SignUpGatekeeper } from './SignUpGatekeeper.sol';

contract FreeForAllGatekeeper is SignUpGatekeeper {

    /*
     * Registers the user without any restrictions.
     */
    function register(address, bytes memory) public {
    }
}
