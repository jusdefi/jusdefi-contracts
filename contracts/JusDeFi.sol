// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/math/Math.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import './interfaces/IJusDeFi.sol';
import './JDFIStakingPool.sol';
import './UniswapStakingPool.sol';

contract JusDeFi is IJusDeFi, ERC20 {
  address payable private _uniswapRouter;
  address public _uniswapPair;

  JDFIStakingPool public _jdfiStakingPool;
  UniswapStakingPool public _uniswapStakingPool;

  bool public _liquidityEventOpen;
  uint public _liquidityEventClosedAt;

  uint private _initialUniTotalSupply;

  uint public _votesIncrease;
  uint public _votesDecrease;

  uint private _lastBuybackAt;
  uint private _lastRebaseAt;

  mapping (address => bool) private _transferWhitelist;

  // fee specified in basis points
  uint public _fee; // initialized at 0; not set until #liquidityEventClose
  uint private constant FEE_BASE = 1000;
  uint private constant BP_DIVISOR = 10000;

  uint private constant RESERVE_TEAM = 2000 ether;
  uint private constant RESERVE_JUSTICE = 10000 ether;
  uint private constant RESERVE_LIQUIDITY_EVENT = 10000 ether;
  uint private constant REWARDS_SEED = 2000 ether;

  uint private constant JDFI_PER_ETH = 4;

  constructor (
    address payable uniswapRouter
  )
    ERC20('JusDeFi', 'JDFI')
  {
    _uniswapRouter = uniswapRouter;

    uint initialStake = RESERVE_LIQUIDITY_EVENT + RESERVE_JUSTICE + RESERVE_TEAM;

    _jdfiStakingPool = new JDFIStakingPool(initialStake);

    _uniswapPair = IUniswapV2Factory(
      IUniswapV2Router02(uniswapRouter).factory()
    ).createPair(
      IUniswapV2Router02(uniswapRouter).WETH(),
      address(this)
    );

    _uniswapStakingPool = new UniswapStakingPool(_uniswapPair, uniswapRouter);

    // mint staked JDFI after-the-fact to match minted JDFI/S
    _mint(address(_jdfiStakingPool), initialStake);

    // seed staking pools
    _mint(address(this), REWARDS_SEED);

    // transfer team reserve and justice reserve to sender for distribution
    _jdfiStakingPool.transfer(msg.sender, initialStake - RESERVE_LIQUIDITY_EVENT);

    // approve router to handle UNI-V2 for buybacks
    IUniswapV2Pair(_uniswapPair).approve(uniswapRouter, type(uint).max);

    _liquidityEventClosedAt = block.timestamp + 3 days;
    _liquidityEventOpen = true;

    // enable trusted addresses to transfer tokens without approval
    _transferWhitelist[address(_jdfiStakingPool)] = true;
    _transferWhitelist[address(_uniswapStakingPool)] = true;
    _transferWhitelist[uniswapRouter] = true;
  }

  receive () external payable {
    require(msg.sender == _uniswapRouter, 'JusDeFi: sender must be Uniswap Router');
  }

  /**
  * @notice OpenZeppelin ERC20#transferFrom: enable transfers by staking pools without allowance
  * @param from sender
  * @param to recipient
  * @param amount quantity transferred
   */
  function transferFrom (address from, address to, uint amount) override(IERC20, ERC20) public returns (bool) {
    if (_transferWhitelist[msg.sender]) {
      _transfer(from, to, amount);
      return true;
    } else {
      return super.transferFrom(from, to, amount);
    }
  }

  /**
   * @notice transfer tokens, deducting fee
   * @param account recipient of transfer
   * @param amount quantity of tokens to transfer, before deduction
   */
  function burnAndTransfer (address account, uint amount) override external {
    uint withheld = amount * _fee / BP_DIVISOR;
    _transfer(msg.sender, address(this), withheld);
    _burn(address(this), withheld / 2);
    _transfer(msg.sender, account, amount - withheld);
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
    require(!_liquidityEventOpen, 'JusDeFi: liquidity event still in progress');
    require(block.timestamp / (1 days) % 7 == 1, 'JusDeFi: buyback must take place on Friday (UTC)');
    require(block.timestamp - _lastBuybackAt > 1 days, 'JusDeFi: buyback already called this week');
    _lastBuybackAt = block.timestamp;

    uint initialBalance = balanceOf(address(this));

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
          address(this),
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
    path[1] = address(this);

    // buyback JDFI using ETH from withdrawn liquidity and fee votes
    // TODO: minimum output value

    if (address(this).balance > 0) {
      IUniswapV2Router02(_uniswapRouter).swapExactETHForTokens{
        value: address(this).balance
      }(
        0,
        path,
        address(this), // TODO: Uniswap disallows transfering to token address
        block.timestamp
      );
    }

    _burn(address(this), balanceOf(address(this)) - initialBalance);
  }

  /**
   * @notice distribute collected fees to staking pools
   */
  function rebase () external {
    require(!_liquidityEventOpen, 'JusDeFi: liquidity event still in progress');
    require(block.timestamp / (1 days) % 7 == 3, 'JusDeFi: rebase must take place on Sunday (UTC)');
    require(block.timestamp - _lastRebaseAt > 1 days, 'JusDeFi: rebase already called this week');
    _lastRebaseAt = block.timestamp;

    // skim to prevent manipulation of JDFI reserve
    IUniswapV2Pair(_uniswapPair).skim(address(this));
    uint rewards = balanceOf(address(this));

    // TODO: zero-division

    uint jdfiStakingPoolStaked = _jdfiStakingPool.totalSupply();
    uint uniswapStakingPoolStaked = balanceOf(_uniswapPair) * _uniswapStakingPool.totalSupply() / IUniswapV2Pair(_uniswapPair).totalSupply();

    uint totalWeight = jdfiStakingPoolStaked + uniswapStakingPoolStaked * 3;

    uint jdfiStakingPoolRewards = rewards * jdfiStakingPoolStaked / totalWeight;
    uint uniswapStakingPoolRewards = rewards - jdfiStakingPoolRewards;

    if (jdfiStakingPoolRewards > 0) {
      _transfer(address(this), address(_jdfiStakingPool), jdfiStakingPoolRewards);
      _jdfiStakingPool.distributeRewards(jdfiStakingPoolRewards);
    }

    if (uniswapStakingPoolRewards > 0) {
      _transfer(address(this), address(_uniswapStakingPool), uniswapStakingPoolRewards);
      _uniswapStakingPool.distributeRewards(uniswapStakingPoolRewards);
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
   * @notice deposit ETH to receive JDFI/S at rate of 1:4
   */
  function liquidityEventDeposit () external payable {
    require(_liquidityEventOpen, 'JusDeFi: liquidity event has closed');

    try _jdfiStakingPool.transfer(msg.sender, msg.value * JDFI_PER_ETH) returns (bool) {} catch {
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
    uint distributed = RESERVE_LIQUIDITY_EVENT - remaining;

    // require minimum deposit to avoid nonspecific Uniswap error: ds-math-sub-underflow
    require(distributed >= 1 ether, 'JusDeFi: insufficient liquidity added');

    // fee initialized at zero, so unstaked amount is 1:1
    _jdfiStakingPool.unstake(remaining);
    _burn(address(this), remaining);

    address pair = _uniswapPair;
    address weth = IUniswapV2Router02(_uniswapRouter).WETH();
    IWETH(weth).deposit{ value: distributed / JDFI_PER_ETH }();
    IWETH(weth).transfer(pair, distributed / JDFI_PER_ETH);
    _mint(pair, distributed);

    // JDFI transfers are reverted up to this point; Uniswap pool is guaranteed to have no liquidity
    _initialUniTotalSupply = IUniswapV2Pair(pair).mint(address(this)) + IUniswapV2Pair(_uniswapPair).MINIMUM_LIQUIDITY();

    // set initial fee
    _fee = FEE_BASE;
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

  /**
   * @notice calculate fee offset based on net votes
   * @dev input is a uint, therefore sigmoid is only implemented for positive values
   * @return uint fee offset from FEE_BASE
   */
  function _sigmoid (uint net) private pure returns (uint) {
    return FEE_BASE * net / (3 ether + net);
  }
}
