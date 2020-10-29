// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.7.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import './StakingPool.sol';

contract DevStakingPool is StakingPool {
  using Address for address payable;

  address payable private _weth;

  constructor (address payable weth) ERC20('JDFI ETH Fund', 'JDFI/E') {
    _weth = weth;
    _mint(msg.sender, 10000 ether);
  }

  /**
   * @notice withdraw earned WETH rewards
   */
  function withdraw () external {
    IERC20(_weth).transfer(msg.sender, rewardsOf(msg.sender));
    _clearRewards(msg.sender);
  }

  /**
   * @notice distribute rewards to stakers
   * @param amount quantity to distribute
   */
  function distributeRewards (uint amount) override external {
    IERC20(_weth).transferFrom(msg.sender, address(this), amount);
    _distributeRewards(amount);
  }
}
