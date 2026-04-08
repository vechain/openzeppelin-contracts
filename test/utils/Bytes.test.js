const { BN, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { MAX_UINT256 } = constants;

const Bytes = artifacts.require('$Bytes');

const lorem = Buffer.from(
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'utf8',
);
const loremHex = '0x' + lorem.toString('hex');
const present = lorem[1]; // a byte that is present in lorem
const absent = 255; // 0xFF - not present in lorem (latin-1 chars not in ASCII range)

contract('Bytes', function () {
  before(async function () {
    this.mock = await Bytes.new();
  });

  describe('indexOf', function () {
    it('first', async function () {
      const idx = lorem.indexOf(present);
      expect(await this.mock.methods['$indexOf(bytes,bytes1)'](loremHex, web3.utils.numberToHex(present))).to.be.bignumber.equal(new BN(idx));
    });

    it('from index', async function () {
      for (const start of [0, 5, 50, lorem.length - 1, lorem.length, lorem.length + 5]) {
        const index = lorem.indexOf(present, start);
        const result = index === -1 ? MAX_UINT256 : new BN(index);
        expect(
          await this.mock.methods['$indexOf(bytes,bytes1,uint256)'](loremHex, web3.utils.numberToHex(present), start),
        ).to.be.bignumber.equal(result);
      }
    });

    it('absent', async function () {
      expect(
        await this.mock.methods['$indexOf(bytes,bytes1)'](loremHex, web3.utils.numberToHex(absent)),
      ).to.be.bignumber.equal(MAX_UINT256);
    });

    it('empty buffer', async function () {
      expect(await this.mock.methods['$indexOf(bytes,bytes1)']('0x', '0x00')).to.be.bignumber.equal(MAX_UINT256);
      expect(
        await this.mock.methods['$indexOf(bytes,bytes1,uint256)']('0x', '0x00', 17),
      ).to.be.bignumber.equal(MAX_UINT256);
    });
  });

  describe('lastIndexOf', function () {
    it('first', async function () {
      const idx = lorem.lastIndexOf(present);
      expect(
        await this.mock.methods['$lastIndexOf(bytes,bytes1)'](loremHex, web3.utils.numberToHex(present)),
      ).to.be.bignumber.equal(new BN(idx));
    });

    it('from index', async function () {
      for (const start of [0, 5, 50, lorem.length - 1, lorem.length, lorem.length + 5]) {
        const index = lorem.lastIndexOf(present, start);
        const result = index === -1 ? MAX_UINT256 : new BN(index);
        expect(
          await this.mock.methods['$lastIndexOf(bytes,bytes1,uint256)'](loremHex, web3.utils.numberToHex(present), start),
        ).to.be.bignumber.equal(result);
      }
    });

    it('absent', async function () {
      expect(
        await this.mock.methods['$lastIndexOf(bytes,bytes1)'](loremHex, web3.utils.numberToHex(absent)),
      ).to.be.bignumber.equal(MAX_UINT256);
    });

    it('empty buffer', async function () {
      expect(await this.mock.methods['$lastIndexOf(bytes,bytes1)']('0x', '0x00')).to.be.bignumber.equal(MAX_UINT256);
      expect(
        await this.mock.methods['$lastIndexOf(bytes,bytes1,uint256)']('0x', '0x00', 17),
      ).to.be.bignumber.equal(MAX_UINT256);
    });
  });

  describe('slice & splice', function () {
    describe('slice(bytes, uint256) & splice(bytes, uint256)', function () {
      for (const [descr, start] of Object.entries({
        'start = 0': 0,
        'start within bound': 10,
        'start out of bound': 1000,
      })) {
        it(descr, async function () {
          const result = '0x' + lorem.slice(start).toString('hex');
          expect((await this.mock.methods['$splice(bytes,uint256)'](loremHex, start)) ?? '0x').to.equal(result);
        });
      }
    });

    describe('slice(bytes, uint256, uint256) & splice(bytes, uint256, uint256)', function () {
      for (const [descr, [start, end]] of Object.entries({
        'start = 0': [0, 42],
        'start and end within bound': [17, 42],
        'end out of bound': [42, 1000],
        'start = end': [17, 17],
        'start > end': [42, 17],
      })) {
        it(descr, async function () {
          const sliced = start > end ? Buffer.alloc(0) : lorem.slice(start, Math.min(end, lorem.length));
          const result = '0x' + sliced.toString('hex');
          expect((await this.mock.methods['$slice(bytes,uint256,uint256)'](loremHex, start, end)) ?? '0x').to.equal(result);
          expect((await this.mock.methods['$splice(bytes,uint256,uint256)'](loremHex, start, end)) ?? '0x').to.equal(result);
        });
      }
    });
  });

  describe('concat', function () {
    it('empty list', async function () {
      expect((await this.mock.$concat([])) ?? '0x').to.equal('0x');
    });

    it('single item', async function () {
      const item = '0x' + Buffer.from('hello').toString('hex');
      expect(await this.mock.$concat([item])).to.equal(item);
    });

    it('multiple items', async function () {
      const items = ['0xdeadbeef', '0xcafe', '0x1234567890'];
      const expected = '0x' + items.map(x => x.slice(2)).join('');
      expect(await this.mock.$concat(items)).to.equal(expected);
    });
  });

  describe('nibbles', function () {
    it('full input', async function () {
      expect(await this.mock.$toNibbles('0x0123456789abcdef')).to.equal('0x000102030405060708090a0b0c0d0e0f');
    });

    it('empty input', async function () {
      expect((await this.mock.$toNibbles('0x')) ?? '0x').to.equal('0x');
    });
  });

  describe('equal', function () {
    it('identical buffers', async function () {
      expect(await this.mock.$equal(loremHex, loremHex)).to.equal(true);
    });

    it('different content', async function () {
      const different = '0x' + Buffer.from('Different content').toString('hex');
      expect(await this.mock.$equal(loremHex, different)).to.equal(false);
    });

    it('different lengths', async function () {
      const shorter = '0x' + lorem.slice(0, 10).toString('hex');
      expect(await this.mock.$equal(loremHex, shorter)).to.equal(false);
    });

    it('empty buffers', async function () {
      expect(await this.mock.$equal('0x', '0x')).to.equal(true);
    });

    it('one empty one not', async function () {
      expect(await this.mock.$equal(loremHex, '0x')).to.equal(false);
    });
  });

  describe('reverseBits', function () {
    describe('reverseBytes32', function () {
      it('reverses bytes correctly', async function () {
        expect(await this.mock.$reverseBytes32('0x0000000000000000000000000000000000000000000000000000000000000000')).to.equal(
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        );
        expect(
          await this.mock.$reverseBytes32('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
        ).to.equal('0xefcdab8967452301efcdab8967452301efcdab8967452301efcdab8967452301');
      });

      it('double reverse returns original', async function () {
        const value = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const reversed = await this.mock.$reverseBytes32(value);
        expect(await this.mock.$reverseBytes32(reversed)).to.equal(value);
      });
    });

    describe('reverseBytes16', function () {
      it('reverses bytes correctly', async function () {
        expect(await this.mock.$reverseBytes16('0x00000000000000000000000000000000')).to.equal(
          '0x00000000000000000000000000000000',
        );
        expect(await this.mock.$reverseBytes16('0x0123456789abcdef0123456789abcdef')).to.equal(
          '0xefcdab8967452301efcdab8967452301',
        );
      });
    });

    describe('reverseBytes8', function () {
      it('reverses bytes correctly', async function () {
        expect(await this.mock.$reverseBytes8('0x0000000000000000')).to.equal('0x0000000000000000');
        expect(await this.mock.$reverseBytes8('0x123456789abcdef0')).to.equal('0xf0debc9a78563412');
      });
    });

    describe('reverseBytes4', function () {
      it('reverses bytes correctly', async function () {
        expect(await this.mock.$reverseBytes4('0x00000000')).to.equal('0x00000000');
        expect(await this.mock.$reverseBytes4('0x12345678')).to.equal('0x78563412');
      });
    });

    describe('reverseBytes2', function () {
      it('reverses bytes correctly', async function () {
        expect(await this.mock.$reverseBytes2('0x0000')).to.equal('0x0000');
        expect(await this.mock.$reverseBytes2('0x1234')).to.equal('0x3412');
      });
    });
  });
});
