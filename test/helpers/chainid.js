const hre = require('hardhat');

async function getChainId() {
  // On the eth-equivalence Thor branch, the EVM `block.chainid` opcode (used by
  // EIP712 domain separators on-chain) returns eth_chainId, not the full genesis
  // id. Derive the JS-side chainId the same way so signatures/digests line up.
  const chainIdHex = await hre.network.provider.send('eth_chainId', []);
  return new hre.web3.utils.BN(chainIdHex, 'hex');
}

module.exports = {
  getChainId,
};
