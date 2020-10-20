// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import './StakingPool.sol';

contract StakingPoolMock is StakingPool {
  constructor () ERC20('', '') {}

  function mint (address account, uint amount) external {
    _mint(account, amount);
  }

  function scaledRewardsOf (address account) external view returns (uint) {
    return _scaledRewardsOf(account);
  }

  function accrueRewards (uint amount) external {
    _accrueRewards(amount);
  }

  function deductRewards (address account) external {
    _deductRewards(account);
  }
}
