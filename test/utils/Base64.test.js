const { expect } = require('chai');

const Base64 = artifacts.require('$Base64');
const Base64Dirty = artifacts.require('$Base64Dirty');

contract('Base64', function () {
  beforeEach(async function () {
    this.base64 = await Base64.new();
  });

  describe('from bytes - base64', function () {
    it('converts to base64 encoded string with double padding', async function () {
      const TEST_MESSAGE = 'test';
      const input = web3.utils.asciiToHex(TEST_MESSAGE);
      expect(await this.base64.$encode(input)).to.equal('dGVzdA==');
    });

    it('converts to base64 encoded string with single padding', async function () {
      const TEST_MESSAGE = 'test1';
      const input = web3.utils.asciiToHex(TEST_MESSAGE);
      expect(await this.base64.$encode(input)).to.equal('dGVzdDE=');
    });

    it('converts to base64 encoded string without padding', async function () {
      const TEST_MESSAGE = 'test12';
      const input = web3.utils.asciiToHex(TEST_MESSAGE);
      expect(await this.base64.$encode(input)).to.equal('dGVzdDEy');
    });

    it('converts to base64 encoded string (/ case)', async function () {
      const input = web3.utils.asciiToHex('où');
      expect(await this.base64.$encode(input)).to.equal('b/k=');
    });

    it('converts to base64 encoded string (+ case)', async function () {
      const input = web3.utils.asciiToHex('zs~1t8');
      expect(await this.base64.$encode(input)).to.equal('enN+MXQ4');
    });

    it('empty bytes', async function () {
      expect(await this.base64.$encode([])).to.equal('');
    });
  });

  describe('from bytes - base64url', function () {
    it('converts to base64url encoded string with double padding', async function () {
      const input = web3.utils.asciiToHex('test');
      expect(await this.base64.$encodeURL(input)).to.equal('dGVzdA');
    });

    it('converts to base64url encoded string with single padding', async function () {
      const input = web3.utils.asciiToHex('test1');
      expect(await this.base64.$encodeURL(input)).to.equal('dGVzdDE');
    });

    it('converts to base64url encoded string without padding', async function () {
      const input = web3.utils.asciiToHex('test12');
      expect(await this.base64.$encodeURL(input)).to.equal('dGVzdDEy');
    });

    it('converts to base64url encoded string (_ case)', async function () {
      const input = web3.utils.asciiToHex('où');
      expect(await this.base64.$encodeURL(input)).to.equal('b_k');
    });

    it('converts to base64url encoded string (- case)', async function () {
      const input = web3.utils.asciiToHex('zs~1t8');
      expect(await this.base64.$encodeURL(input)).to.equal('enN-MXQ4');
    });

    it('empty bytes', async function () {
      expect(await this.base64.$encodeURL([])).to.equal('');
    });
  });

  it('Encode reads beyond the input buffer into dirty memory', async function () {
    const mock = await Base64Dirty.new();
    const buffer32 = Buffer.from(web3.utils.soliditySha3('example').replace(/0x/, ''), 'hex');
    const buffer31 = buffer32.slice(0, -2);

    expect(await mock.encode(buffer31)).to.equal(buffer31.toString('base64'));
    expect(await mock.encode(buffer32)).to.equal(buffer32.toString('base64'));
  });
});
