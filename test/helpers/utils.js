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

    // The standard hardhat HttpProvider JSON.stringifies params, which throws on
    // BigInt slots. Normalize index to a hex quantity string and default the block.
    const data = await provider.request({
        method: "eth_getStorageAt",
        params: [address, "0x" + BigInt(index).toString(16), block ?? "latest"],
    });

    return data;
}

/**
 * Advances the chain by one block.
 * On VeChain/Thor, polls eth_blockNumber until it increases (the SDK's evm_mine
 * uses object-reference comparison and returns immediately without waiting).
 */
async function advanceBlock() {
    const current = await latestBlock();
    const maxWaitMs = 30000;
    const pollIntervalMs = 200;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const next = await latestBlock();
        if (next > current) return;
    }
    throw new Error('advanceBlock: timed out waiting for next VeChain block');
}

module.exports = {
    latest,
    latestBlock,
    getStorageAt,
    getThorProvider,
    advanceBlock,
}