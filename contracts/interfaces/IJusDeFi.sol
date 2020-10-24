// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IJusDeFi is IERC20 {
  function burnAndTransfer (address account, uint amount) external;
}
