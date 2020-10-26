// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/math/Math.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import '@nomiclabs/buidler/console.sol';

import './interfaces/IJusDeFi.sol';
import './interfaces/IStakingPool.sol';

contract FeePool {
  address private _jusdefi;

  address payable private _uniswapRouter;
  address private _uniswapPair;

  address public _jdfiStakingPool;
  address public _univ2StakingPool;

  // fee specified in basis points
  uint public _fee; // initialized at 0; not set until #liquidityEventClose
  uint private constant FEE_BASE = 1000;
  uint private constant BP_DIVISOR = 10000;

  uint private _initialUniTotalSupply;

  uint public _votesIncrease;
  uint public _votesDecrease;

  uint private _lastBuybackAt;
  uint private _lastRebaseAt;

  constructor (
    address jdfiStakingPool,
    address univ2StakingPool,
    address payable uniswapRouter,
    address uniswapPair,
    uint liquidityEventDistribution
  ) {
    _jusdefi = msg.sender;
    _jdfiStakingPool = jdfiStakingPool;
    _univ2StakingPool = univ2StakingPool;
    _uniswapRouter = uniswapRouter;
    _uniswapPair = uniswapPair;

    // approve router to handle UNI-V2 for buybacks
    IUniswapV2Pair(uniswapPair).approve(uniswapRouter, type(uint).max);

    _initialUniTotalSupply = IUniswapV2Pair(uniswapPair).mint(address(this)) + IUniswapV2Pair(uniswapPair).MINIMUM_LIQUIDITY();
    _fee = FEE_BASE;
  }

  receive () external payable {
    require(msg.sender == _uniswapRouter, 'JusDeFi: sender must be Uniswap Router');
  }

  function calculateWithholding (uint amount) external view returns (uint) {
    return amount * _fee / BP_DIVISOR;
  }

  /**
   * @notice vote for weekly fee changes by sending ETH
   * @param increase whether vote is to increase or decrease the fee
   */
  function vote (bool increase) external payable {
    if (increase) {
      _votesIncrease += msg.value;
    } else {
      _votesDecrease += msg.value;
    }
  }

  /**
   * @notice withdraw Uniswap liquidity in excess of initial amount, purchase and burn JDFI
   */
  function buyback () external {
    require(block.timestamp / (1 days) % 7 == 1, 'JusDeFi: buyback must take place on Friday (UTC)');
    require(block.timestamp - _lastBuybackAt > 1 days, 'JusDeFi: buyback already called this week');
    _lastBuybackAt = block.timestamp;

    uint initialBalance = IJusDeFi(_jusdefi).balanceOf(address(this));

    // remove liquidity in excess of original amount

    uint initialUniTotalSupply = _initialUniTotalSupply;
    uint uniTotalSupply = IUniswapV2Pair(_uniswapPair).totalSupply();

    if (uniTotalSupply > initialUniTotalSupply) {
      uint delta = Math.min(
        IUniswapV2Pair(_uniswapPair).balanceOf(address(this)),
        uniTotalSupply - initialUniTotalSupply
      );

      if (delta > 0) {
        // TODO: minimum output values

        IUniswapV2Router02(_uniswapRouter).removeLiquidityETH(
          _jusdefi,
          delta,
          0,
          0,
          address(this),
          block.timestamp
        );
      }
    }

    address[] memory path = new address[](2);
    path[0] = IUniswapV2Router02(_uniswapRouter).WETH();
    path[1] = _jusdefi;

    // buyback JDFI using ETH from withdrawn liquidity and fee votes
    // TODO: minimum output value

    if (address(this).balance > 0) {
      IUniswapV2Router02(_uniswapRouter).swapExactETHForTokens{
        value: address(this).balance
      }(
        0,
        path,
        address(this),
        block.timestamp
      );
    }

    IJusDeFi(_jusdefi).burn(IJusDeFi(_jusdefi).balanceOf(address(this)) - initialBalance);
  }

  /**
   * @notice distribute collected fees to staking pools
   */
  function rebase () external {
    require(block.timestamp / (1 days) % 7 == 3, 'JusDeFi: rebase must take place on Sunday (UTC)');
    require(block.timestamp - _lastRebaseAt > 1 days, 'JusDeFi: rebase already called this week');
    _lastRebaseAt = block.timestamp;

    // skim to prevent manipulation of JDFI reserve
    IUniswapV2Pair(_uniswapPair).skim(address(this));
    uint rewards = IJusDeFi(_jusdefi).balanceOf(address(this));

    // TODO: zero-division

    uint jdfiStakingPoolStaked = IERC20(_jdfiStakingPool).totalSupply();
    uint univ2StakingPoolStaked = IJusDeFi(_jusdefi).balanceOf(_uniswapPair) * IERC20(_univ2StakingPool).totalSupply() / IUniswapV2Pair(_uniswapPair).totalSupply();

    uint totalWeight = jdfiStakingPoolStaked + univ2StakingPoolStaked * 3;

    uint jdfiStakingPoolRewards = rewards * jdfiStakingPoolStaked / totalWeight;
    uint univ2StakingPoolRewards = rewards - jdfiStakingPoolRewards;

    if (jdfiStakingPoolRewards > 0) {
      IStakingPool(_jdfiStakingPool).distributeRewards(jdfiStakingPoolRewards);
    }

    if (univ2StakingPoolRewards > 0) {
      IStakingPool(_univ2StakingPool).distributeRewards(univ2StakingPoolRewards);
    }

    // set fee for the next week

    uint increase = _votesIncrease;
    uint decrease = _votesDecrease;

    if (increase > decrease) {
      _fee = FEE_BASE + _sigmoid(increase - decrease);
    } else if (increase < decrease) {
      _fee = FEE_BASE - _sigmoid(decrease - increase);
    } else {
      _fee = FEE_BASE;
    }

    _votesIncrease = 0;
    _votesDecrease = 0;
  }

  /**
   * @notice calculate fee offset based on net votes
   * @dev input is a uint, therefore sigmoid is only implemented for positive values
   * @return uint fee offset from FEE_BASE
   */
  function _sigmoid (uint net) private pure returns (uint) {
    return FEE_BASE * net / (3 ether + net);
  }
}
