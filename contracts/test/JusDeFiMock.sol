// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

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

  function distributeUniswapStakingPoolRewards (uint amount) external {
    _mint(address(this), amount);
    IStakingPool(_uniswapStakingPool).distributeRewards(amount);
  }
}
