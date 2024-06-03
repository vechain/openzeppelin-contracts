const hre = require('hardhat');
const { BN } = require('@openzeppelin/test-helpers');

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

    return new BN(parseInt(latestBlock.timestamp, 16));
}

async function getStorageAt(
    address,
    index,
    block
) {
    const provider = await getThorProvider();

    const data = await provider.request({
        method: "eth_getStorageAt",
        params: [address, index, block],
    });

    return data;
}

module.exports = {
    latest,
    latestBlock,
    getStorageAt,
    getThorProvider
}