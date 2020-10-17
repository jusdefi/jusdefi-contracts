// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import './IJusDeFi.sol';
import './StakingPool.sol';

contract JDFIStakingPool is StakingPool {
  address private _jusdefi;

  mapping (address => uint) private _lockedBalances;

  constructor (uint initialSupply) ERC20('Staked JDFI', 'JDFI/S') {
    _jusdefi = msg.sender;
    // initialSupply is minted before receipt of JDFI; see JusDeFi constructor
    _mint(msg.sender, initialSupply);
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
    _deductRewards(msg.sender);
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
  function unstake (uint amount) external {
    _burn(msg.sender, amount);
    IJusDeFi(_jusdefi).burnAndTransfer(msg.sender, amount + rewardsOf(msg.sender));
    _deductRewards(msg.sender);
  }

  /**
   * @notice deposit ETH to free locked token balance, at a rate of 1:4
   */
  function unlock () external payable {
    uint amount = msg.value * 4;
    require(_lockedBalances[msg.sender] >= amount, 'JusDeFi: insufficient locked balance');
    _lockedBalances[msg.sender] -= amount;
  }

  /**
   * @notice distribute rewards to stakers
   * @param amount quantity to distribute
   */
  function accrueRewards (uint amount) external {
    require(msg.sender == _jusdefi, 'JusDeFi: sender must be JusDeFi contract');
    _accrueRewards(amount);
  }

  /**
   * @notice airdrop frozen tokens to given accounts in given quantities
   * @dev _mint and _burn are used in place of _transfer due to gas considerations
   * @param accounts airdrop recipients
   * @param amounts airdrop quantities
   */
  function airdropFrozen (address[] calldata accounts, uint[] calldata amounts) external {
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

    if (locked > 0) {
      require(balanceOf(from) - locked >= amount, 'JusDeFi: amount exceeds unlocked balance');
    }
  }
}
