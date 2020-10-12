// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

contract JusDeFi is ERC20 {
  using SafeMath for uint;

  uint private constant INITIAL_SUPPLY = 21000 ether;
  uint private constant OWNER_SUPPLY = 1000 ether;

  uint private constant FLOAT_SCALAR = 2**64;

  uint private constant BURN_RATE = 1500;
  uint private constant BP_DIVISOR = 10000;

  uint private _stakedTotalSupply;
  mapping (address => uint) private _stakedBalances;

  uint private _dividendPerToken;
  mapping (address => uint) private _dividendsPaid;

  bool private _liquidityEventClosed;
  uint private _liquidityEventClosedAt;

  uint private _epoch;

  address payable private _uniswapRouter;

  event Rebase (uint epoch, uint totalStaked);

  constructor (
    address payable uniswapRouter
  )
    payable
    ERC20('JusDeFi', 'JDFI')
  {
    _uniswapRouter = uniswapRouter;

    _liquidityEventClosedAt = block.timestamp + 1 weeks;

    // TODO: setup uniswap pool

    _mint(address(this), INITIAL_SUPPLY);

    _stakedBalances[msg.sender] = _stakedBalances[msg.sender].add(OWNER_SUPPLY);
    _stakedTotalSupply = _stakedTotalSupply.add(OWNER_SUPPLY);
  }

  function stakedTotalSupply () public view returns (uint) {
    return _stakedTotalSupply;
  }

  function stakedBalanceOf (address account) public view returns (uint) {
    return _stakedBalances[account];
  }

  function dividendsOf (address account) public view returns (uint) {
    return (stakedBalanceOf(account) * _dividendPerToken - _dividendsPaid[account]) / FLOAT_SCALAR;
  }

  function stake (uint amount) external {
    _transfer(msg.sender, address(this), amount);

    _stakedBalances[msg.sender] = _stakedBalances[msg.sender].add(amount);
    _stakedTotalSupply = _stakedTotalSupply.add(amount);

    _dividendsPaid[msg.sender] += amount * _dividendPerToken;
  }

  function unstake (uint amount) external {
    require(stakedBalanceOf(msg.sender) >= amount, 'JusDeFi: insufficient staked balance');

    uint burned = amount * BURN_RATE / BP_DIVISOR;
    _burn(address(this), burned);
    _transfer(address(this), msg.sender, amount.sub(burned));

    _stakedBalances[msg.sender] = _stakedBalances[msg.sender].sub(amount);
    _stakedTotalSupply = _stakedTotalSupply.sub(amount);

    yield();
  }

  function yield () public {
    uint amount = dividendsOf(msg.sender);

    if (amount > 0) {
      _dividendsPaid[msg.sender] += amount.mul(FLOAT_SCALAR);
      _transfer(address(this), msg.sender, amount);
    }
  }

  function rebase () external {
    // TODO: rebase

    emit Rebase(_epoch++, _stakedTotalSupply);
  }

  function closeLiquidityEvent () external {
    require(_liquidityEventClosedAt <= block.timestamp, 'JusDeFi: liquidity event still in progress');
    require(!_liquidityEventClosed, 'JusDeFi: liquidity event has ended');

    _liquidityEventClosed = true;

    // TODO: do not use address(this).balance - exploitable by selfdestruct funding attack

    uint value = address(this).balance;

    IUniswapV2Router02(_uniswapRouter).addLiquidityETH{
      value: value
    }(
      address(this),
      value * 4,
      value * 4,
      value,
      address(this),
      block.timestamp
    );
  }

  receive () external payable {
    require(!_liquidityEventClosed, 'JusDeFi: liquidity event has ended');
    uint amount = msg.value.mul(4);
    require(_stakedTotalSupply + amount <= 10000 ether, 'JusDeFi: deposit limit exceeded');
    _stakedBalances[msg.sender] = _stakedBalances[msg.sender].add(amount);
    _stakedTotalSupply = _stakedTotalSupply.add(amount);
  }

  function _beforeTokenTransfer (address from, address to, uint amount) override internal {
    super._beforeTokenTransfer(from, to, amount);

    if (!_liquidityEventClosed) {
      require(
        from == address(this) || to == address(this) || from == address(0) || to == address(0),
        'JusDeFi: liquidity event has not ended'
      );
    }
  }
}
