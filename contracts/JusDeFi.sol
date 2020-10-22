// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import './IJusDeFi.sol';
import './JDFIStakingPool.sol';
import './UniswapStakingPool.sol';

contract JusDeFi is IJusDeFi, ERC20 {
  address payable private _uniswapRouter;
  address public _uniswapPair;

  JDFIStakingPool public _jdfiStakingPool;
  UniswapStakingPool public _uniswapStakingPool;

  bool public _liquidityEventOpen;
  uint public _liquidityEventClosedAt;

  uint private _initialLiquidity;

  uint private _lastBuybackAt;
  uint private _lastRebaseAt;

  // burn rate specified in basis points
  uint private _burnRate;
  uint private constant BP_DIVISOR = 10000;

  constructor (
    address payable uniswapRouter
  )
    ERC20('JusDeFi', 'JDFI')
  {
    _uniswapRouter = uniswapRouter;

    // liquidity event distribution + justice reserve + team reserve
    uint initialStake = 10000 ether + 10000 ether + 2000 ether;

    _jdfiStakingPool = new JDFIStakingPool(initialStake);

    _uniswapPair = IUniswapV2Factory(
      IUniswapV2Router02(uniswapRouter).factory()
    ).createPair(
      IUniswapV2Router02(uniswapRouter).WETH(),
      address(this)
    );

    _uniswapStakingPool = new UniswapStakingPool(_uniswapPair, uniswapRouter);

    // mint JDFI for staking pool after-the-fact to match minted JDFI/S
    _mint(address(_jdfiStakingPool), initialStake);

    // transfer team reserve and justice reserve to sender for distribution
    _jdfiStakingPool.transfer(msg.sender, initialStake - 10000 ether);

    _liquidityEventClosedAt = block.timestamp + 3 days;
    _liquidityEventOpen = true;
  }

  /**
   * @notice transfer tokens, deducting fee
   * @param account recipient of transfer
   * @param amount quantity of tokens to transfer, before deduction
   */
  function burnAndTransfer (address account, uint amount) override external {
    uint withheld = amount * _burnRate / BP_DIVISOR;
    _transfer(msg.sender, address(this), withheld);
    _burn(address(this), withheld / 2);
    _transfer(msg.sender, account, amount - withheld);
  }

  /**
   * @notice withdraw Uniswap liquidity in excess of initial amount, purchase and burn JDFI
   */
  function buyback () external {
    // TODO: require Friday
    require(block.timestamp - _lastBuybackAt > 3 days);
    _lastBuybackAt = block.timestamp;

    // TODO: frontrunning?

    // TODO: buyback
  }

  /**
   * @notice distribute collected fees to staking pools
   */
  function rebase () external {
    // TODO: require Sunday
    require(block.timestamp - _lastRebaseAt > 3 days);
    _lastRebaseAt = block.timestamp;

    // _jdfiStakingPool.distributeRewards(asdf);
    // _uniswapStakingPool.distributeRewards(ghjk - asdf);

    // TODO: set burn rate
  }

  /**
   * @notice deposit ETH to receive JDFI/S at rate of 1:4
   */
  function liquidityEventDeposit () external payable {
    require(_liquidityEventOpen, 'JusDeFi: liquidity event has closed');

    try _jdfiStakingPool.transfer(msg.sender, msg.value * 4) returns (bool) {} catch {
      revert('JusDeFi: deposit amount surpasses available supply');
    }
  }

  /**
   * @notice close liquidity event, add Uniswap liquidity, burn undistributed JDFI
   */
  function liquidityEventClose () external {
    require(block.timestamp >= _liquidityEventClosedAt, 'JusDeFi: liquidity event still in progress');
    require(_liquidityEventOpen, 'JusDeFi: liquidity event has already ended');
    _liquidityEventOpen = false;

    uint remaining = _jdfiStakingPool.balanceOf(address(this));
    uint distributed = 10000 ether - remaining;

    require(distributed >= 1 ether, 'JusDeFi: insufficient liquidity added');

    // burn rate initialized at zero, so unstaked amount is 1:1
    _jdfiStakingPool.unstake(remaining);
    _burn(address(this), remaining);

    address pair = _uniswapPair;
    address weth = IUniswapV2Router02(_uniswapRouter).WETH();
    IWETH(weth).deposit{ value: distributed / 4 }();
    IWETH(weth).transfer(pair, distributed / 4);
    _mint(pair, distributed);

    // JDFI transfers are reverted up to this point; Uniswap pool is guaranteed to have no liquidity
    _initialLiquidity = IUniswapV2Pair(pair).mint(address(this));

    // set initial burn rate
    _burnRate = 1500;
  }

  /**
   * @notice OpenZeppelin ERC20 hook: prevent transfers during liquidity event
   * @param from sender
   * @param to recipient
   * @param amount quantity transferred
   */
  function _beforeTokenTransfer (address from, address to, uint amount) override internal {
    require(!_liquidityEventOpen, 'JusDeFi: liquidity event still in progress');
    super._beforeTokenTransfer(from, to, amount);
  }
}
