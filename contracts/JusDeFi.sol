// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import './IJusDeFi.sol';
import './JDFIStakingPool.sol';
import './UniswapStakingPool.sol';

contract JusDeFi is IJusDeFi, ERC20 {
  uint private constant BURN_RATE = 1500;
  uint private constant BP_DIVISOR = 10000;

  uint private _liquidityEventClosedAt;

  address payable private _uniswapRouter;

  JDFIStakingPool private _jdfiStakingPool;
  UniswapStakingPool private _uniswapStakingPool;

  constructor (
    address payable uniswapRouter
  )
    ERC20('JusDeFi', 'JDFI')
  {
    _uniswapRouter = uniswapRouter;

    _jdfiStakingPool = new JDFIStakingPool();
    _uniswapStakingPool = new UniswapStakingPool(uniswapRouter);

    _liquidityEventClosedAt = block.timestamp + 1 weeks;

    // mint and stake tokens for airdrop
    _mint(address(this), 10000 ether);
    _jdfiStakingPool.stake(10000 ether);
    _jdfiStakingPool.transfer(msg.sender, 10000 ether);

    // mint developers' reserve
    _mint(msg.sender, 2000 ether);
  }

  /**
   * @notice transfer tokens, deducting fee
   * @param account recipient of transfer
   * @param amount quantity of tokens to transfer, before deduction
   */
  function burnAndTransfer (address account, uint amount) override external {
    uint withheld = amount * BURN_RATE / BP_DIVISOR;
    _transfer(msg.sender, address(this), withheld);
    _burn(address(this), withheld / 2);
    _transfer(msg.sender, account, amount - withheld);
  }

  /**
   * TODO: frontrunning?
   */
  // function buyback () external;

  /**
   * TODO: rebase
   */
  // function rebase () external;

  /**
   * @notice deposit ETH to receive JDFI at rate of 1:4
   */
  function liquidityEventDeposit () external payable {
    require(block.timestamp < _liquidityEventClosedAt, 'JusDeFi: liquidity event has closed');
    // TODO: supply cap

    uint amount = msg.value * 4;

    _mint(address(this), amount * 2);

    // TODO: mint and stake all at once
    _jdfiStakingPool.stake(amount);
    _jdfiStakingPool.transfer(msg.sender, amount);

    IUniswapV2Router02(_uniswapRouter).addLiquidityETH{
      value: msg.value
    }(
      address(this),
      amount,
      amount,
      msg.value,
      address(this),
      block.timestamp
    );
  }

  /**
   * @notice OpenZeppelin ERC20 hook: prevent transfers during liquidity event
   * @param from sender
   * @param to recipient
   * @param amount quantity transferred
   */
  function _beforeTokenTransfer (address from, address to, uint amount) override internal {
    super._beforeTokenTransfer(from, to, amount);

    if (block.timestamp < _liquidityEventClosedAt) {
      require(
        from == address(this) || to == address(this) || from == address(0) || to == address(0),
        'JusDeFi: liquidity event has not ended'
      );
    }
  }
}
