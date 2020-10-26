// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './interfaces/IStakingPool.sol';

abstract contract StakingPool is IStakingPool, ERC20 {
  uint private constant REWARD_SCALAR = 1e18;

  // values scaled by REWARD_SCALAR
  uint private _cumulativeRewardPerToken;
  mapping (address => uint) private _rewardsExcluded;
  mapping (address => uint) private _rewardsReserved;

  /**
   * @notice get rewards of given account available for withdrawal
   * @param account owner of rewards
   * @return uint quantity of rewards available
   */
  function rewardsOf (address account) public view returns (uint) {
    return (
      balanceOf(account) * _cumulativeRewardPerToken
      + _rewardsReserved[account]
      - _rewardsExcluded[account]
    ) / REWARD_SCALAR;
  }

  /**
   * @notice distribute rewards proportionally to stake holders
   * @param amount quantity of rewards to distribute
   */
  function _distributeRewards (uint amount) internal {
    uint supply = totalSupply();
    require(supply > 0, 'StakingPool: supply must be greater than zero');
    _cumulativeRewardPerToken += amount * REWARD_SCALAR / supply;
  }

  /**
   * @notice remove pending rewards associated with account
   * @param account owner of rewards
   */
  function _clearRewards (address account) internal {
    _rewardsExcluded[account] = balanceOf(account) * _cumulativeRewardPerToken;
    delete _rewardsReserved[account];
  }

  /**
   * @notice OpenZeppelin ERC20 hook: maintain reward distribution when tokens are transferred
   * @param from sender
   * @param to recipient
   * @param amount quantity transferred
   */
  function _beforeTokenTransfer (address from, address to, uint amount) virtual override internal {
    super._beforeTokenTransfer(from, to, amount);

    uint delta = amount * _cumulativeRewardPerToken;

    if (from != address(0)) {
      uint excluded = balanceOf(from) * _cumulativeRewardPerToken;
      _rewardsReserved[from] += excluded - _rewardsExcluded[from];
      _rewardsExcluded[from] = excluded - delta;
    }

    if (to != address(0)) {
      _rewardsExcluded[to] += delta;
    }
  }
}
