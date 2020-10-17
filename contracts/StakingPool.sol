// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

abstract contract StakingPool is ERC20 {
  uint private constant REWARD_SCALAR = 1e18;

  // values scaled by REWARD_SCALAR
  uint private _cumulativeRewardPerToken;
  mapping (address => uint) private _rewardsDeducted;
  mapping (address => uint) private _rewardsReserved;

  /**
   * @notice get undistributed rewards for account
   * @param account benificiary of rewards
   * @return uint reward amount
   */
  function rewardsOf (address account) public view returns (uint) {
    return _scaledRewardsOf(account) / REWARD_SCALAR;
  }

  /**
   * @notice get undistributed rewards for account, scaled by REWARD_SCALAR
   * @param account benificiary of rewards
   * @return uint scaled reward amount
   */
  function _scaledRewardsOf (address account) internal view returns (uint) {
    return balanceOf(account) * _cumulativeRewardPerToken - _rewardsDeducted[account];
  }

  /**
   * @notice distribute rewards to stakers
   * @param amount quantity to distribute
   */
  function _accrueRewards (uint amount) internal {
    _cumulativeRewardPerToken += amount * REWARD_SCALAR / totalSupply();
  }

  /**
   * @notice mark account as having been paid all rewards owed
   * @param account address to update
   */
  function _deductRewards (address account) internal {
    _rewardsDeducted[account] += _scaledRewardsOf(account);
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
      _rewardsDeducted[from] -= delta;
      _rewardsReserved[from] += delta;
    }

    if (to != address(0)) {
      _rewardsDeducted[to] += delta;
    }
  }
}
