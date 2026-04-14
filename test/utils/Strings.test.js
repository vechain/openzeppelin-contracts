const { BN, constants, expectRevert } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const Strings = artifacts.require('$Strings');

contract('Strings', function () {
  before(async function () {
    this.strings = await Strings.new();
  });

  describe('toString', function () {
    const values = [
      '0',
      '7',
      '10',
      '99',
      '100',
      '101',
      '123',
      '4132',
      '12345',
      '1234567',
      '1234567890',
      '123456789012345',
      '12345678901234567890',
      '123456789012345678901234567890',
      '1234567890123456789012345678901234567890',
      '12345678901234567890123456789012345678901234567890',
      '123456789012345678901234567890123456789012345678901234567890',
      '1234567890123456789012345678901234567890123456789012345678901234567890',
    ];

    describe('uint256', function () {
      it('converts MAX_UINT256', async function () {
        const value = constants.MAX_UINT256;
        expect(await this.strings.methods['$toString(uint256)'](value)).to.equal(value.toString(10));
      });

      for (const value of values) {
        it(`converts ${value}`, async function () {
          expect(await this.strings.methods['$toString(uint256)'](value)).to.equal(value);
        });
      }
    });

    describe('int256', function () {
      it('converts MAX_INT256', async function () {
        const value = constants.MAX_INT256;
        expect(await this.strings.methods['$toStringSigned(int256)'](value)).to.equal(value.toString(10));
      });

      it('converts MIN_INT256', async function () {
        const value = constants.MIN_INT256;
        expect(await this.strings.methods['$toStringSigned(int256)'](value)).to.equal(value.toString(10));
      });

      for (const value of values) {
        it(`convert ${value}`, async function () {
          expect(await this.strings.methods['$toStringSigned(int256)'](value)).to.equal(value);
        });

        it(`convert negative ${value}`, async function () {
          const negated = new BN(value).neg();
          expect(await this.strings.methods['$toStringSigned(int256)'](negated)).to.equal(negated.toString(10));
        });
      }
    });
  });

  describe('toHexString', function () {
    it('converts 0', async function () {
      expect(await this.strings.methods['$toHexString(uint256)'](0)).to.equal('0x00');
    });

    it('converts a positive number', async function () {
      expect(await this.strings.methods['$toHexString(uint256)'](0x4132)).to.equal('0x4132');
    });

    it('converts MAX_UINT256', async function () {
      expect(await this.strings.methods['$toHexString(uint256)'](constants.MAX_UINT256)).to.equal(
        web3.utils.toHex(constants.MAX_UINT256),
      );
    });
  });

  describe('toHexString fixed', function () {
    it('converts a positive number (long)', async function () {
      expect(await this.strings.methods['$toHexString(uint256,uint256)'](0x4132, 32)).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000004132',
      );
    });

    it('converts a positive number (short)', async function () {
      const length = 1;
      await expectRevert.unspecified(
        this.strings.methods['$toHexString(uint256,uint256)'](0x4132, length)
      );
    });

    it('converts MAX_UINT256', async function () {
      expect(await this.strings.methods['$toHexString(uint256,uint256)'](constants.MAX_UINT256, 32)).to.equal(
        web3.utils.toHex(constants.MAX_UINT256),
      );
    });
  });

  describe('toHexString address', function () {
    it('converts a random address', async function () {
      const addr = '0xa9036907dccae6a1e0033479b12e837e5cf5a02f';
      expect(await this.strings.methods['$toHexString(address)'](addr)).to.equal(addr);
    });

    it('converts an address with leading zeros', async function () {
      const addr = '0x0000e0ca771e21bd00057f54a68c30d400000000';
      expect(await this.strings.methods['$toHexString(address)'](addr)).to.equal(addr);
    });
  });

  describe('equal', function () {
    it('compares two empty strings', async function () {
      expect(await this.strings.methods['$equal(string,string)']('', '')).to.equal(true);
    });

    it('compares two equal strings', async function () {
      expect(await this.strings.methods['$equal(string,string)']('a', 'a')).to.equal(true);
    });

    it('compares two different strings', async function () {
      expect(await this.strings.methods['$equal(string,string)']('a', 'b')).to.equal(false);
    });

    it('compares two different strings of different lengths', async function () {
      expect(await this.strings.methods['$equal(string,string)']('a', 'aa')).to.equal(false);
      expect(await this.strings.methods['$equal(string,string)']('aa', 'a')).to.equal(false);
    });

    it('compares two different large strings', async function () {
      const str1 = 'a'.repeat(201);
      const str2 = 'a'.repeat(200) + 'b';
      expect(await this.strings.methods['$equal(string,string)'](str1, str2)).to.equal(false);
    });

    it('compares two equal large strings', async function () {
      const str1 = 'a'.repeat(201);
      const str2 = 'a'.repeat(201);
      expect(await this.strings.methods['$equal(string,string)'](str1, str2)).to.equal(true);
    });
  });

  describe('toChecksumHexString', function () {
    const addresses = [
      '0xa9036907dccae6a1e0033479b12e837e5cf5a02f',
      '0x0000e0ca771e21bd00057f54a68c30d400000000',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ];

    for (const addr of addresses) {
      it(`converts ${addr}`, async function () {
        expect(await this.strings.$toChecksumHexString(addr)).to.equal(
          web3.utils.toChecksumAddress(addr),
        );
      });
    }
  });

  describe('parseAddress', function () {
    const addresses = [
      '0xa9036907dccae6a1e0033479b12e837e5cf5a02f',
      '0x0000e0ca771e21bd00057f54a68c30d400000000',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ];

    for (const addr of addresses) {
      it(`parses ${addr}`, async function () {
        const checksumAddr = web3.utils.toChecksumAddress(addr);
        expect(await this.strings.$parseAddress(addr)).to.equal(checksumAddr);
        const [success, parsed] = Object.values(await this.strings.$tryParseAddress(addr));
        expect(success).to.be.true;
        expect(parsed).to.equal(checksumAddr);
      });
    }

    it('returns false for invalid address format', async function () {
      const [success] = Object.values(
        await this.strings.$tryParseAddress('0x736a507fB2881d6-B62dcA54673CF5295dC07833'),
      );
      expect(success).to.be.false;
    });
  });

  describe('parseUint and tryParseUint', function () {
    const values = ['0', '7', '123', '1234567890', '12345678901234567890'];

    for (const value of values) {
      it(`parses ${value}`, async function () {
        expect((await this.strings.$parseUint(value)).toString()).to.equal(value);
        const [success, parsed] = Object.values(await this.strings.$tryParseUint(value));
        expect(success).to.be.true;
        expect(parsed.toString()).to.equal(value);
      });
    }

    it('returns false for invalid uint string', async function () {
      const [success] = Object.values(await this.strings.$tryParseUint('abc'));
      expect(success).to.be.false;
    });
  });

  describe('parseInt and tryParseInt', function () {
    const values = ['0', '7', '123', '-42', '-1234567890'];

    for (const value of values) {
      it(`parses ${value}`, async function () {
        expect((await this.strings.$parseInt(value)).toString()).to.equal(value);
        const [success, parsed] = Object.values(await this.strings.$tryParseInt(value));
        expect(success).to.be.true;
        expect(parsed.toString()).to.equal(value);
      });
    }

    it('returns false for invalid int string', async function () {
      const [success] = Object.values(await this.strings.$tryParseInt('abc'));
      expect(success).to.be.false;
    });
  });

  describe('parseHexUint and tryParseHexUint', function () {
    it('parses 0x00', async function () {
      expect((await this.strings.$parseHexUint('0x00')).toString()).to.equal('0');
      const [success, parsed] = Object.values(await this.strings.$tryParseHexUint('0x00'));
      expect(success).to.be.true;
      expect(parsed.toString()).to.equal('0');
    });

    it('parses 0x4132', async function () {
      expect((await this.strings.$parseHexUint('0x4132')).toString()).to.equal('16690');
      const [success, parsed] = Object.values(await this.strings.$tryParseHexUint('0x4132'));
      expect(success).to.be.true;
      expect(parsed.toString()).to.equal('16690');
    });

    it('parses hex without 0x prefix', async function () {
      const [success, parsed] = Object.values(await this.strings.$tryParseHexUint('4132'));
      expect(success).to.be.true;
      expect(parsed.toString()).to.equal('16690');
    });

    it('returns false for invalid hex string', async function () {
      const [success] = Object.values(await this.strings.$tryParseHexUint('0xgg'));
      expect(success).to.be.false;
    });
  });

  describe('toHexString (bytes)', function () {
    for (const length of [0, 17, 20, 32]) {
      it(`hexlifies buffer of length ${length}`, async function () {
        const buffer = web3.utils.randomHex(length);
        const result = await this.strings.methods['$toHexString(bytes)'](buffer);
        expect(result.toLowerCase()).to.equal(buffer.toLowerCase());
      });
    }
  });

  describe('escapeJSON', function () {
    const inputs = [
      { input: '', expected: '' },
      { input: 'a', expected: 'a' },
      { input: '{"a":"b/c"}', expected: '{"a":"b\\/c"}' },
    ];

    for (const { input } of inputs) {
      it(`escapes ${JSON.stringify(input)}`, async function () {
        expect(await this.strings.$escapeJSON(input)).to.equal(
          JSON.stringify(input).slice(1, -1),
        );
      });
    }
  });
});
