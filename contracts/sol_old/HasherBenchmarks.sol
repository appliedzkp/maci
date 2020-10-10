pragma solidity ^0.5.0;

import { Hasher } from "./Hasher.sol";

contract HasherBenchmarks is Hasher {
    function hash5Benchmark(uint256[] memory array) public {
        hash5(array);
    }

    function hash11Benchmark(uint256[] memory array) public {
        hash11(array);
    }

    function hashLeftRightBenchmark(uint256 _left, uint256 _right) public {
        hashLeftRight(_left, _right);
    }
}

