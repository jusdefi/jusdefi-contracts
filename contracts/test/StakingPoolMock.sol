// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '../StakingPool.sol';

contract StakingPoolMock is StakingPool {
  constructor () ERC20('', '') {}

  function mint (address account, uint amount) external {
    _mint(account, amount);
  }

  function distributeRewards (uint amount) external {
    _distributeRewards(amount);
  }

  function clearRewards (address account) external {
    _clearRewards(account);
  }
}
