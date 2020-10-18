// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import './IJusDeFi.sol';
import './StakingPool.sol';

contract UniswapStakingPool is StakingPool {
  using Address for address payable;

  address private _jusdefi;
  address private _uniswapPair;
  address payable private _uniswapRouter;

  constructor (
    address uniswapPair,
    address payable uniswapRouter
  )
    ERC20('Staked JDFI/WETH UNI-V2', 'JDFI-WETH-UNI-V2/S')
  {
    _jusdefi = msg.sender;
    _uniswapPair = uniswapPair;
    _uniswapRouter = uniswapRouter;
  }

  /**
   * @notice deposit earned JDFI and sent ETH to Uniswap and stake without incurring burns
   * @param amountETHMin minimum quantity of ETH to stake, despite price depreciation
   */
  function compound (uint amountETHMin) external payable {
    uint rewards = rewardsOf(msg.sender);
    _deductRewards(msg.sender);

    (
      ,
      uint amountETH,
      uint liquidity
    ) = IUniswapV2Router02(_uniswapRouter).addLiquidityETH{
      value: msg.value
    }(
      _jusdefi,
      rewards,
      rewards,
      amountETHMin,
      address(this),
      block.timestamp
    );

    // return remaining ETH to sender
    msg.sender.sendValue(msg.value - amountETH);

    _mint(msg.sender, liquidity);
  }

  /**
   * @notice deposit and stake preexisting Uniswap liquidity tokens
   * @param amount quantity of Uniswap liquidity tokens to stake
   */
  function stake (uint amount) external {
    IERC20(_uniswapPair).transferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, amount);
  }

  /**
   * @notice deposit JDFI and ETH to Uniswap and stake
   * @dev params passed directly to IUniswapV2Router02#addLiquidityETH
   * @param amountJDFIDesired quantity of JDFI to stake if price depreciates
   * @param amountJDFIMin minimum quantity of JDFI to stake, despite price appreciation
   * @param amountETHMin minimum quantity of ETH to stake, despite price depreciation
   */
  function stake (
    uint amountJDFIDesired,
    uint amountJDFIMin,
    uint amountETHMin
  ) external payable {
    IERC20(_jusdefi).transferFrom(msg.sender, address(this), amountJDFIDesired);

    (
      uint amountJDFI,
      uint amountETH,
      uint liquidity
    ) = IUniswapV2Router02(_uniswapRouter).addLiquidityETH{
      value: msg.value
    }(
      _jusdefi,
      amountJDFIDesired,
      amountJDFIMin,
      amountETHMin,
      address(this),
      block.timestamp
    );


    // return remaining JDFI and ETH to sender
    IERC20(_jusdefi).transfer(msg.sender, amountJDFIDesired - amountJDFI);
    msg.sender.sendValue(msg.value - amountETH);

    _mint(msg.sender, liquidity);
  }

  /**
   * @notice remove Uniswap liquidity and withdraw and unstake underlying JDFI and ETH
   * @param amount quantity of tokens to unstake
   * @param amountJDFIMin minimum quantity of JDFI to unstake, despite price appreciate
   * @param amountETHMin minimum quantity of ETH to unstake, despite price depreciation
   */
  function unstake (
    uint amount,
    uint amountJDFIMin,
    uint amountETHMin
  ) external {
    _burn(msg.sender, amount);

    (
      uint amountJDFI,
      uint amountETH
    ) = IUniswapV2Router02(_uniswapRouter).removeLiquidityETH(
      _jusdefi,
      amount,
      amountJDFIMin,
      amountETHMin,
      address(this),
      block.timestamp
    );

    IJusDeFi(_jusdefi).burnAndTransfer(msg.sender, amountJDFI + rewardsOf(msg.sender));
    _deductRewards(msg.sender);
    msg.sender.sendValue(amountETH);
  }

  /**
   * @notice distribute rewards to stakers
   * @param amount quantity to distribute
   */
  function accrueRewards (uint amount) external {
    require(msg.sender == _jusdefi, 'JusDeFi: sender must be JusDeFi contract');
    _accrueRewards(amount);
  }
}
