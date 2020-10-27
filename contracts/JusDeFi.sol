// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/FixedPoint.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';
import '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol';

import './interfaces/IJusDeFi.sol';
import './interfaces/IStakingPool.sol';
import './interfaces/IJDFIStakingPool.sol';
import './FeePool.sol';
import './DevStakingPool.sol';
import './JDFIStakingPool.sol';
import './UNIV2StakingPool.sol';

contract JusDeFi is IJusDeFi, ERC20 {
  using FixedPoint for FixedPoint.uq112x112;
  using FixedPoint for FixedPoint.uq144x112;
  using SafeMath for uint;

  address payable private _weth;

  address payable private _uniswapRouter;
  address public _uniswapPair;

  address payable override public _feePool;
  address public _devStakingPool;
  address public _jdfiStakingPool;
  address public _univ2StakingPool;

  bool public _liquidityEventOpen;
  uint public _liquidityEventClosedAt;

  mapping (address => bool) private _transferWhitelist;

  uint private constant RESERVE_TEAM = 2000 ether;
  uint private constant RESERVE_JUSTICE = 10000 ether;
  uint private constant RESERVE_LIQUIDITY_EVENT = 10000 ether;
  uint private constant REWARDS_SEED = 2000 ether;

  uint private constant JDFI_PER_ETH = 4;

  uint private constant ORACLE_PERIOD = 5 minutes;

  FixedPoint.uq112x112 private _priceAverage;
  uint private _priceCumulativeLast;
  uint32 private _blockTimestampLast;

  constructor (
    address payable uniswapRouter
  )
    ERC20('JusDeFi', 'JDFI')
  {
    address payable weth = payable(IUniswapV2Router02(uniswapRouter).WETH());
    _weth = weth;

    address uniswapPair = IUniswapV2Factory(
      IUniswapV2Router02(uniswapRouter).factory()
    ).createPair(weth, address(this));

    _uniswapRouter = uniswapRouter;
    _uniswapPair = uniswapPair;

    uint initialStake = RESERVE_LIQUIDITY_EVENT + RESERVE_JUSTICE + RESERVE_TEAM;

    _devStakingPool = address(new DevStakingPool(weth));
    _jdfiStakingPool = address(new JDFIStakingPool(initialStake, weth, _devStakingPool));
    _univ2StakingPool = address(new UNIV2StakingPool(uniswapPair, uniswapRouter));

    // mint staked JDFI after-the-fact to match minted JDFI/S
    _mint(_jdfiStakingPool, initialStake);

    // transfer all minted JDFI/E to sender
    IStakingPool(_devStakingPool).transfer(msg.sender, IStakingPool(_devStakingPool).balanceOf(address(this)));

    // transfer team reserve and justice reserve to sender for distribution
    IStakingPool(_jdfiStakingPool).transfer(msg.sender, initialStake - RESERVE_LIQUIDITY_EVENT);

    _liquidityEventClosedAt = block.timestamp + 3 days;
    _liquidityEventOpen = true;

    // enable trusted addresses to transfer tokens without approval
    _transferWhitelist[_jdfiStakingPool] = true;
    _transferWhitelist[_univ2StakingPool] = true;
    _transferWhitelist[uniswapRouter] = true;
  }

  /**
   * @notice get average JDFI price over the last ORACLE_PERIOD
   * @dev adapted from https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleOracleSimple.sol
   * @param amount quantity of ETH used for purchase
   * @return uint quantity of JDFI purchased, or zero if ORACLE_PERIOD has passed since las tupdate
   */
  function consult (uint amount) override external view returns (uint) {
    if (block.timestamp - uint(_blockTimestampLast) > ORACLE_PERIOD) {
      return 0;
    } else {
      return _priceAverage.mul(amount).decode144();
    }
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
    IUniswapV2Pair pair = IUniswapV2Pair(_uniswapPair);

    address weth = _weth;
    IWETH(weth).deposit{ value: distributed / JDFI_PER_ETH }();
    IWETH(weth).transfer(address(pair), distributed / JDFI_PER_ETH);
    _mint(address(pair), distributed);

    _feePool = payable(new FeePool(
      _jdfiStakingPool,
      _univ2StakingPool,
      _uniswapRouter,
      _uniswapPair
    ));

    // UNI-V2 has been minted, so price is available
    _priceCumulativeLast =  address(this) > _weth ? pair.price0CumulativeLast() : pair.price1CumulativeLast();
    _blockTimestampLast = UniswapV2OracleLibrary.currentBlockTimestamp();

    // unstake and burn (including fee accrued on unstaking)
    IJDFIStakingPool(_jdfiStakingPool).unstake(remaining);
    _burn(address(this), balanceOf(address(this)));
    _burn(_feePool, balanceOf(_feePool));

    // seed staking pools
    _mint(_feePool, REWARDS_SEED);
  }

  /**
   * @notice OpenZeppelin ERC20 hook: prevent transfers during liquidity event, update oracle price
   * @dev adapted from https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleOracleSimple.sol
   * @param from sender
   * @param to recipient
   * @param amount quantity transferred
   */
  function _beforeTokenTransfer (address from, address to, uint amount) override internal {
    require(!_liquidityEventOpen, 'JusDeFi: liquidity event still in progress');
    super._beforeTokenTransfer(from, to, amount);

    address pair = _uniswapPair;

    if (from == pair || (to == pair && from != address(0))) {
      (
        uint price0Cumulative,
        uint price1Cumulative,
        uint32 blockTimestamp
      ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);

      uint32 timeElapsed = blockTimestamp - _blockTimestampLast; // overflow is desired

      // only store the ETH -> JDFI price
      uint priceCumulative = address(this) > _weth ? price0Cumulative : price1Cumulative;

      if (timeElapsed >= ORACLE_PERIOD) {
        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        _priceAverage = FixedPoint.uq112x112(uint224((priceCumulative - _priceCumulativeLast) / timeElapsed));

        _priceCumulativeLast = priceCumulative;
        _blockTimestampLast = blockTimestamp;
      }
    }
  }
}
