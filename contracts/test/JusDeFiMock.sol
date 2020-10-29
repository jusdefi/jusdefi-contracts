// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.7.4;

import '../JusDeFi.sol';
import '../interfaces/IStakingPool.sol';

contract JusDeFiMock is JusDeFi {
  constructor (address payable uniswapRouter) JusDeFi(uniswapRouter) {}

  function mint (address account, uint amount) external {
    _mint(account, amount);
  }

  function distributeJDFIStakingPoolRewards (uint amount) external {
    _mint(address(this), amount);
    IStakingPool(_jdfiStakingPool).distributeRewards(amount);
  }

  function distributeUNIV2StakingPoolRewards (uint amount) external {
    _mint(address(this), amount);
    IStakingPool(_univ2StakingPool).distributeRewards(amount);
  }
}
