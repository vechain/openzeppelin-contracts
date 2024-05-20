const hre = require('hardhat');

  let cachedIsThorNetwork;
  async function checkIfThorNetwork(provider, networkName) {
      let version;
      if (cachedIsThorNetwork === undefined) {
          try {
              const response = await provider.request({
                  method: "web3_clientVersion",
              });
              version = response.toString();
              cachedIsThorNetwork = version.toLowerCase().startsWith("thor");
          } catch (e) {
              cachedIsThorNetwork = false;
          }
      }
      if (!cachedIsThorNetwork) {
          throw new Error("Running tests against Thor, but current network is " + networkName + ".");
      }
      return cachedIsThorNetwork;
  }
  
  async function getThorProvider() {
      const provider = hre.network.provider;
  
      await checkIfThorNetwork(provider, hre.network.name);
  
      return hre.network.provider;
  }
  
  /**
   * Returns the number of the latest block
   */
  async function latestBlock() {
      const provider = await getThorProvider();
      const height = (await provider.request({
          method: "eth_blockNumber",
          params: [],
      }));
  
      return parseInt(height, 16);
  }
  
  /**
   * Returns the timestamp of the latest block
   */
  async function latest() {
      const provider = await getThorProvider();
  
      const latestBlock = (await provider.request({
          method: "eth_getBlockByNumber",
          params: ["latest", false],
      }));
  
      return parseInt(latestBlock.timestamp, 16);
  }
  
  module.exports = {
      latest,
      latestBlock,
      getVechainProvider: getThorProvider
  }