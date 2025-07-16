const hre = require('hardhat');

async function getChainId() {
  // const chainIdHex = await hre.network.provider.send('eth_chainId', []);
  // const bn = new hre.web3.utils.BN(chainIdHex, 'hex');
  // return bn;

  const genesisBlock = await hre.network.provider.send('eth_getBlockByNumber',['0x00',false]);
  return new hre.web3.utils.BN(genesisBlock.hash, 'hex');
}

module.exports = {
  getChainId,
};
