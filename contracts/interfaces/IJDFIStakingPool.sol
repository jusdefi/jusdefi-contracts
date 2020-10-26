// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import './IStakingPool.sol';

interface IJDFIStakingPool is IStakingPool {
  function unstake (uint amount) external;
}
