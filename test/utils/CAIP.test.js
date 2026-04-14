require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const CAIP2 = artifacts.require('$CAIP2');
const CAIP10 = artifacts.require('$CAIP10');

contract('CAIP utilities', function () {
  describe('CAIP-2', function () {
    before(async function () {
      this.mock = await CAIP2.new();
    });

    const chains = [
      { namespace: 'eip155', reference: '1', caip2: 'eip155:1' },
      { namespace: 'eip155', reference: '137', caip2: 'eip155:137' },
      { namespace: 'solana', reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' },
    ];

    for (const { namespace, reference, caip2 } of chains) {
      it(`format(${namespace}, ${reference})`, async function () {
        expect(await this.mock.$format(namespace, reference)).to.equal(caip2);
      });

      it(`parse(${caip2})`, async function () {
        const result = await this.mock.$parse(caip2);
        expect(result[0]).to.equal(namespace);
        expect(result[1]).to.equal(reference);
      });
    }
  });

  describe('CAIP-10', function () {
    const account = web3.utils.toChecksumAddress(web3.utils.randomHex(20));

    before(async function () {
      this.mock = await CAIP10.new();
    });

    const chainFormats = [
      { caip2: 'eip155:1' },
      { caip2: 'eip155:137' },
    ];

    for (const { caip2 } of chainFormats) {
      const caip10 = `${caip2}:${account.toLowerCase()}`;

      it(`format(${caip2}, ${account})`, async function () {
        expect(await this.mock.$format(caip2, account.toLowerCase())).to.equal(caip10);
      });

      it(`parse(${caip10})`, async function () {
        const result = await this.mock.$parse(caip10);
        expect(result[0]).to.equal(caip2);
        expect(result[1]).to.equal(account.toLowerCase());
      });
    }
  });
});
