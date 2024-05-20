const ozHelpers = require('@openzeppelin/test-helpers');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const utils = require('./utils');

module.exports = {
  clock: {
    blocknumber: () => utils.latestBlock(),
    timestamp: () => utils.latest(),
  },
  clockFromReceipt: {
    blocknumber: receipt => Promise.resolve(receipt.blockNumber),
    timestamp: receipt => web3.eth.getBlock(receipt.blockNumber).then(block => block.timestamp),
  },
  forward: {
    blocknumber: ozHelpers.time.advanceBlockTo,
    timestamp: helpers.time.increaseTo,
  },
};
