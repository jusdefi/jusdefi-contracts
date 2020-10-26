// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import './interfaces/IJusDeFi.sol';
import './interfaces/IStakingPool.sol';
import './interfaces/IJDFIStakingPool.sol';
import './FeePool.sol';
import './JDFIStakingPool.sol';
import './UniswapStakingPool.sol';

contract JusDeFi is IJusDeFi, ERC20 {
  address payable private _uniswapRouter;
  address public _uniswapPair;

  address payable public _feePool;
  address public _jdfiStakingPool;
  address public _uniswapStakingPool;

  bool public _liquidityEventOpen;
  uint public _liquidityEventClosedAt;

  mapping (address => bool) private _transferWhitelist;

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
    address uniswapPair = IUniswapV2Factory(
      IUniswapV2Router02(uniswapRouter).factory()
    ).createPair(
      IUniswapV2Router02(uniswapRouter).WETH(),
      address(this)
    );

    uint initialStake = RESERVE_LIQUIDITY_EVENT + RESERVE_JUSTICE + RESERVE_TEAM;

    _jdfiStakingPool = address(new JDFIStakingPool(initialStake));
    _uniswapStakingPool = address(new UniswapStakingPool(uniswapPair, uniswapRouter));

    // mint staked JDFI after-the-fact to match minted JDFI/S
    _mint(_jdfiStakingPool, initialStake);

    // transfer team reserve and justice reserve to sender for distribution
    IStakingPool(_jdfiStakingPool).transfer(msg.sender, initialStake - RESERVE_LIQUIDITY_EVENT);

    _liquidityEventClosedAt = block.timestamp + 3 days;
    _liquidityEventOpen = true;

    // enable trusted addresses to transfer tokens without approval
    _transferWhitelist[_jdfiStakingPool] = true;
    _transferWhitelist[_uniswapStakingPool] = true;
    _transferWhitelist[uniswapRouter] = true;

    _uniswapRouter = uniswapRouter;
    _uniswapPair = uniswapPair;
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
   * @notice burn tokens held by sender
   * @param amount quantity of tokens to burn
   */
  function burn (uint amount) override external {
    _burn(msg.sender, amount);
  }

  /**
   * @notice transfer tokens, deducting fee
   * @param account recipient of transfer
   * @param amount quantity of tokens to transfer, before deduction
   */
  function burnAndTransfer (address account, uint amount) override external {
    uint withheld = FeePool(_feePool).calculateWithholding(amount);
    _transfer(msg.sender, _feePool, withheld);
    _burn(_feePool, withheld / 2);
    _transfer(msg.sender, account, amount - withheld);
  }

  /**
   * @notice deposit ETH to receive JDFI/S at rate of 1:4
   */
  function liquidityEventDeposit () external payable {
    require(_liquidityEventOpen, 'JusDeFi: liquidity event has closed');

    try IStakingPool(_jdfiStakingPool).transfer(msg.sender, msg.value * JDFI_PER_ETH) returns (bool) {} catch {
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

    uint remaining = IStakingPool(_jdfiStakingPool).balanceOf(address(this));
    uint distributed = RESERVE_LIQUIDITY_EVENT - remaining;

    // require minimum deposit to avoid nonspecific Uniswap error: ds-math-sub-underflow
    require(distributed >= 1 ether, 'JusDeFi: insufficient liquidity added');

    // prepare Uniswap for minting my FeePool
    address pair = _uniswapPair;
    address weth = IUniswapV2Router02(_uniswapRouter).WETH();
    IWETH(weth).deposit{ value: distributed / JDFI_PER_ETH }();
    IWETH(weth).transfer(pair, distributed / JDFI_PER_ETH);
    _mint(pair, distributed);

    _feePool = payable(new FeePool(
      _jdfiStakingPool,
      _uniswapStakingPool,
      _uniswapRouter,
      _uniswapPair,
      distributed
    ));

    // unstake and burn (including fee accrued on unstaking)
    IJDFIStakingPool(_jdfiStakingPool).unstake(remaining);
    _burn(address(this), balanceOf(address(this)));
    _burn(_feePool, balanceOf(_feePool));

    // seed staking pools
    _mint(_feePool, REWARDS_SEED);
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
