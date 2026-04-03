const { expect } = require('chai');
const { erc7201Slot } = require('../helpers/storage');

const SlotDerivation = artifacts.require('$SlotDerivation');

contract('SlotDerivation', function (accounts) {
  const [account] = accounts;

  beforeEach(async function () {
    this.mock = await SlotDerivation.new();
  });

  describe('namespaces', function () {
    const namespace = 'example.main';

    it('erc-7201', async function () {
      expect(await this.mock.$erc7201Slot(namespace)).to.equal(erc7201Slot(namespace));
    });
  });

  describe('derivation', function () {
    it('offset', async function () {
      const base = web3.utils.randomHex(32);
      const offset = web3.utils.randomHex(32);
      const expected = '0x' + ((BigInt(base) + BigInt(offset)) & ((1n << 256n) - 1n)).toString(16).padStart(64, '0');
      expect(await this.mock.$offset(base, offset)).to.equal(expected);
    });

    it('array', async function () {
      const base = web3.utils.randomHex(32);
      expect(await this.mock.$deriveArray(base)).to.equal(web3.utils.keccak256(base));
    });

    describe('mapping', function () {
      it('bool', async function () {
        const base = web3.utils.randomHex(32);
        const key = true;
        const encoded = web3.eth.abi.encodeParameters(['bool', 'bytes32'], [key, base]);
        const expected = web3.utils.keccak256(encoded);
        expect(await this.mock.methods['$deriveMapping(bytes32,bool)'](base, key)).to.equal(expected);
      });

      it('address', async function () {
        const base = web3.utils.randomHex(32);
        const key = account;
        const encoded = web3.eth.abi.encodeParameters(['address', 'bytes32'], [key, base]);
        const expected = web3.utils.keccak256(encoded);
        expect(await this.mock.methods['$deriveMapping(bytes32,address)'](base, key)).to.equal(expected);
      });

      it('bytes32', async function () {
        const base = web3.utils.randomHex(32);
        const key = web3.utils.randomHex(32);
        const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes32'], [key, base]);
        const expected = web3.utils.keccak256(encoded);
        expect(await this.mock.methods['$deriveMapping(bytes32,bytes32)'](base, key)).to.equal(expected);
      });

      it('uint256', async function () {
        const base = web3.utils.randomHex(32);
        const key = '12345678901234567890';
        const encoded = web3.eth.abi.encodeParameters(['uint256', 'bytes32'], [key, base]);
        const expected = web3.utils.keccak256(encoded);
        expect(await this.mock.methods['$deriveMapping(bytes32,uint256)'](base, key)).to.equal(expected);
      });

      it('string', async function () {
        const base = web3.utils.randomHex(32);
        const key = 'lorem ipsum';
        // For reference types (string, bytes): solidityPackedKeccak256([type, 'bytes32'], [key, base])
        const encoded = web3.utils.soliditySha3(
          { type: 'string', value: key },
          { type: 'bytes32', value: base },
        );
        expect(await this.mock.methods['$deriveMapping(bytes32,string)'](base, key)).to.equal(encoded);
      });

      it('bytes', async function () {
        const base = web3.utils.randomHex(32);
        const key = web3.utils.randomHex(128);
        // For reference types: solidityPackedKeccak256
        const encoded = web3.utils.soliditySha3(
          { type: 'bytes', value: key },
          { type: 'bytes32', value: base },
        );
        expect(await this.mock.methods['$deriveMapping(bytes32,bytes)'](base, key)).to.equal(encoded);
      });
    });
  });
});
