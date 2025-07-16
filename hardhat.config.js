/// ENVVAR
// - CI:                output gas report to file instead of stdout
// - COVERAGE:          enable coverage report
// - ENABLE_GAS_REPORT: enable gas report
// - COMPILE_MODE:      production modes enables optimizations (default: development)
// - COMPILE_VERSION:   compiler version (default: 0.8.20)
// - COINMARKETCAP:     coinmarkercat api key for USD value in gas report

require("@vechain/sdk-hardhat-plugin");

const fs = require('fs-extra');
const path = require('path');
const proc = require('child_process');
const { task } = require("hardhat/config");

const argv = require('yargs/yargs')()
  .env('')
  .options({
    coverage: {
      type: 'boolean',
      default: false,
    },
    gas: {
      alias: 'enableGasReport',
      type: 'boolean',
      default: false,
    },
    gasReport: {
      alias: 'enableGasReportPath',
      type: 'string',
      implies: 'gas',
      default: undefined,
    },
    mode: {
      alias: 'compileMode',
      type: 'string',
      choices: ['production', 'development'],
      default: 'development',
    },
    ir: {
      alias: 'enableIR',
      type: 'boolean',
      default: false,
    },
    foundry: {
      alias: 'hasFoundry',
      type: 'boolean',
      default: hasFoundry(),
    },
    compiler: {
      alias: 'compileVersion',
      type: 'string',
      default: '0.8.20',
    },
    evmVersion: {
      alias: 'evmVersion',
      type: 'string',
      default: 'shanghai',
    },
    coinmarketcap: {
      alias: 'coinmarketcapApiKey',
      type: 'string',
    },
  }).argv;

require('@nomiclabs/hardhat-truffle5');
require('hardhat-ignore-warnings');
require('hardhat-exposed');
require('solidity-docgen');
argv.foundry && require('@nomicfoundation/hardhat-foundry');

if (argv.foundry && argv.coverage) {
  throw Error('Coverage analysis is incompatible with Foundry. Disable with `FOUNDRY=false` in the environment');
}

for (const f of fs.readdirSync(path.join(__dirname, 'hardhat'))) {
  require(path.join(__dirname, 'hardhat', f));
}

const withOptimizations = argv.gas || argv.compileMode === 'production';

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: argv.compiler,
    settings: {
      optimizer: {
        enabled: withOptimizations,
        runs: 200,
      },
      evmVersion: argv.evmVersion,
      viaIR: withOptimizations && argv.ir,
      outputSelection: { '*': { '*': ['storageLayout'] } },
    },
  },
  warnings: {
    'contracts-exposed/**/*': {
      'code-size': 'off',
      'initcode-size': 'off',
    },
    '*': {
      'code-size': withOptimizations,
      'unused-param': !argv.coverage, // coverage causes unused-param warnings
      default: 'error',
    },
  },
  networks: {
    hardhat: {
      blockGasLimit: 10000000,
      allowUnlimitedContractSize: !withOptimizations,
    },
    vechain: {
      url: "http://127.0.0.1:8669",
      accounts: {
        mnemonic: "denial kitchen pet squirrel other broom bar gas better priority spoil cross",
        count: 10,
      },
      gas: 50000000,
    },
    vechain_galactica_testnet: {
      url: "https://galactica.dev.node.vechain.org",
      accounts: {
        mnemonic: process.env.GALACTICA_DEVNET_MNEMONIC || "",
        path: "m/44'/818'/0'/0",
        count: 5,
        initialIndex: 0,
        passphrase: 'vechainthor'
      },
    },
  },
  exposed: {
    imports: true,
    initializers: true,
    exclude: ['vendor/**/*'],
  },
  mocha: {
    // reporter: "reporter.js",
    timeout: 5 * 60 * 1000,
  },
  docgen: require('./docs/config'),
  paths:{
    sources:"./contracts",
    tests:shard_test_dir()
  }
};

if (argv.gas) {
  require('hardhat-gas-reporter');
  module.exports.gasReporter = {
    showMethodSig: true,
    currency: 'USD',
    outputFile: argv.gasReport,
    coinmarketcap: argv.coinmarketcap,
  };
}

if (argv.coverage) {
  require('solidity-coverage');
  module.exports.networks.hardhat.initialBaseFeePerGas = 0;
}

function hasFoundry() {
  return proc.spawnSync('forge', ['-V'], { stdio: 'ignore' }).error === undefined;
}

function shard_test_dir() {
  const shard_id = process.env.npm_config_shard_id || process.env.SHARD_ID || argv.shard_id || ""
  const shard_test_dir = path.join(__dirname,`./shard_test_${shard_id}`);

  if(shard_id !== "" && fs.existsSync(shard_test_dir)){
    return shard_test_dir;
  } else {
    return "./test"
  }
}

task("pre-test","Initialize shard test directory").setAction(async () => {
  const shard_id = process.env.npm_config_shard_id || process.env.SHARD_ID || argv.shard_id || ""

  if(shard_id === ""){
    console.warn("No shard_id provided. The hardhat will return all test case.");
    process.exit(0);
  }

  const shard_test_dir = path.join(__dirname,`./shard_test_${shard_id}`);
  const shard_config_path = path.join(__dirname,"./test/test_shard_config.json");

  if(await fs.exists(shard_config_path) == false){
    console.error(`No found ${shard_config_path}.`);
    process.exit(1);
  }

  const shard_json = JSON.parse(await fs.readFile(shard_config_path));
  const shard_config = shard_json.find(s => s.sharding_id == shard_id);
  
  if(shard_config == null || !Array.isArray(shard_config.sources_paths) || shard_config.sources_paths.length == 0) {
    console.error(`Not found ${shard_id} config`);
    process.exit(1);
  }

  try {
    if(await fs.exists(shard_test_dir) == true){
      await fs.remove(shard_test_dir);
    }
    fs.mkdir(shard_test_dir);
    
    for(const source of shard_config.sources_paths) {
      if(await fs.exists(path.join(__dirname,source))){
        var target = source.replace(/^\.\/test\//, `./shard_test_${shard_id}/`)
        await fs.copy(path.join(__dirname,source),path.join(__dirname,target))
      }
    }
  } catch(e) {
    console.error(`Initialize ${shard_test_dir} directory faild. ${e}`)
    process.exit(1);
  }

  console.log(`Initialize ${shard_test_dir} directory completed.`);
  process.exit(0);
});

task("post-test","Remove shard test directory").setAction(async() => {
  const shard_id = process.env.npm_config_shard_id || process.env.SHARD_ID || argv.shard_id || ""
  
  if(shard_id !== ""){
    const shard_test_dir = path.join(__dirname,`./shard_test_${shard_id}`);
    if(await fs.exists(shard_test_dir)){
      await fs.remove(shard_test_dir);
    }
  }
  process.exit(0);
});
