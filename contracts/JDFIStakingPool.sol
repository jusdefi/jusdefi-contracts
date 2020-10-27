// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IWETH.sol';

import './interfaces/IJusDeFi.sol';
import './interfaces/IJDFIStakingPool.sol';
import './StakingPool.sol';

contract JDFIStakingPool is IJDFIStakingPool, StakingPool {
  using Address for address payable;

  address private _jusdefi;
  address payable private _weth;
  address private _devStakingPool;

  mapping (address => uint) private _lockedBalances;

  uint private constant JDFI_PER_ETH = 4;

  constructor (
    uint initialSupply,
    address payable weth,
    address devStakingPool
  ) ERC20('Staked JDFI', 'JDFI/S') {
    _jusdefi = msg.sender;
    _weth = weth;
    _devStakingPool = devStakingPool;

    // initialSupply is minted before receipt of JDFI; see JusDeFi constructor
    _mint(msg.sender, initialSupply);

    // approve devStakingPool to spend WETH
    IERC20(weth).approve(_devStakingPool, type(uint).max);
  }

  /**
   * @notice query locked balance of an address
   * @param account address to query
   * @return uint locked balance of account
   */
  function lockedBalanceOf (address account) public view returns (uint) {
    return _lockedBalances[account];
  }

  /**
   * @notice stake earned rewards without incurring burns
   */
  function compound () external {
    uint amount = rewardsOf(msg.sender);
    _clearRewards(msg.sender);
    _mint(msg.sender, amount);
  }

  /**
   * @notice deposit and stake JDFI
   * @param amount quantity of JDFI to stake
   */
  function stake (uint amount) external {
    IJusDeFi(_jusdefi).transferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, amount);
  }

  /**
   * @notice unstake and withdraw JDFI
   * @param amount quantity of tokens to unstake
   */
  function unstake (uint amount) override external {
    _burn(msg.sender, amount);
    IJusDeFi(_jusdefi).burnAndTransfer(msg.sender, amount);
  }

  /**
   * @notice withdraw earned JDFI rewards
   */
  function withdraw () external {
    IJusDeFi(_jusdefi).burnAndTransfer(msg.sender, rewardsOf(msg.sender));
    _clearRewards(msg.sender);
  }

  /**
   * @notice deposit ETH to free locked token balance, at a rate of 1:4
   */
  function unlock () external payable {
    // fee pool address not available at deployment time, so fetch dynamically
    address payable feePool = IJusDeFi(_jusdefi)._feePool();
    require(feePool != address(0), 'JusDeFi: liquidity event still in progress');

    uint amount = msg.value * JDFI_PER_ETH;
    require(_lockedBalances[msg.sender] >= amount, 'JusDeFi: insufficient locked balance');
    _lockedBalances[msg.sender] -= amount;

    uint dev = msg.value / 2;

    // staking pool contract designed to work with ERC20, so convert to WETH
    IWETH(_weth).deposit{ value: dev }();
    IStakingPool(_devStakingPool).distributeRewards(dev);

    feePool.sendValue(address(this).balance);
  }

  /**
   * @notice distribute rewards to stakers
   * @param amount quantity to distribute
   */
  function distributeRewards (uint amount) override external {
    IJusDeFi(_jusdefi).transferFrom(msg.sender, address(this), amount);
    _distributeRewards(amount);
  }

  /**
   * @notice airdrop locked tokens to given accounts in given quantities
   * @dev _mint and _burn are used in place of _transfer due to gas considerations
   * @param accounts airdrop recipients
   * @param amounts airdrop quantities
   */
  function airdropLocked (address[] calldata accounts, uint[] calldata amounts) external {
    require(accounts.length == amounts.length, 'JusDeFi: array lengths do not match');

    uint length = accounts.length;
    uint initialSupply = totalSupply();

    for (uint i; i < length; i++) {
      address account = accounts[i];
      uint amount = amounts[i];
      _mint(account, amount);
      _lockedBalances[account] += amount;
    }

    _burn(msg.sender, totalSupply() - initialSupply);
  }

  /**
   * @notice OpenZeppelin ERC20 hook: prevent transfer of locked tokens
   * @param from sender
   * @param to recipient
   * @param amount quantity transferred
   */
  function _beforeTokenTransfer (address from, address to, uint amount) override internal {
    super._beforeTokenTransfer(from, to, amount);

    uint locked = lockedBalanceOf(from);

    require(
      locked == 0 || balanceOf(from) - locked >= amount,
      'JusDeFi: amount exceeds unlocked balance'
    );
  }
}
