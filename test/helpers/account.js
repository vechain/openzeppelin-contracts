const { ethers, web3 } = require('hardhat');
const { impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

// Hardhat default balance
const DEFAULT_BALANCE = web3.utils.toBN('10000000000000000000000');

const impersonate = (account, balance = DEFAULT_BALANCE) => {
  const address = account.target ?? account.address ?? account;
  return impersonateAccount(address)
    .then(() => setBalance(address, typeof balance === 'bigint' ? balance : BigInt(balance.toString())))
    .then(() => ethers.getSigner(address));
};

module.exports = {
  impersonate,
};
