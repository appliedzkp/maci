pragma solidity ^0.5.0;

import { InitialVoiceCreditProxy } from './InitialVoiceCreditProxy.sol';

contract ConstantInitialVoiceCreditProxy is InitialVoiceCreditProxy {

    uint256 internal balance;

    constructor(uint256 _balance) public { 
        balance = _balance;
    }

    function getVoiceCredits(address, bytes memory) public view returns (uint256) {
        return balance;
    }
}
