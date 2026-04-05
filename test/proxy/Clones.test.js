const { expectEvent } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { computeCreate2Address } = require('../helpers/create');
const { expectThorRevert, expectRevertCheckStrategy } = require('../helpers/errors.js');
const shouldBehaveLikeClone = require('./Clones.behaviour');
const Clones = artifacts.require('$Clones');

// VeChain returns empty bytes as null; normalise to '0x' for comparison
const normalizeBytes = v => (v == null || v === '' ? '0x' : v);

// Compute the ERC-1167 clone initcode (for CREATE2 address prediction)
// args === undefined  → standard clone
// args is a hex string → cloneWithImmutableArgs (including '0x' for empty args)
function cloneInitCode(implementationAddress, args) {
  const implHex = implementationAddress.replace(/^0x/, '').toLowerCase();
  if (args !== undefined) {
    // cloneWithImmutableArgs bytecode (includes PUSH2 length prefix)
    const argsHex = args.replace(/^0x/, '');
    const argsLen = argsHex.length / 2;
    const totalLen = 0x2d + argsLen;
    const lenHex = totalLen.toString(16).padStart(4, '0');
    return '0x61' + lenHex + '3d81600a3d39f3363d3d373d3d3d363d73' + implHex + '5af43d82803e903d91602b57fd5bf3' + argsHex;
  }
  // standard clone bytecode
  return '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' + implHex + '5af43d82803e903d91602b57fd5bf3';
}

contract('Clones', function (accounts) {
  const [deployer] = accounts;

  beforeEach('deploy factory', async function () {
    this.factory = await Clones.new();
  });

  // ── without immutable args ──────────────────────────────────────────────────

  describe('without immutable args', function () {
    describe('clone', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const factory = await Clones.new();
        const receipt = await factory.$clone(implementation);
        const address = receipt.logs.find(({ event }) => event === 'return$clone_address').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const receipt = await this.factory.$clone(this.implementation);
        const address = receipt.logs.find(({ event }) => event === 'return$clone_address').args.instance;
        const result = await this.factory.$fetchCloneArgs(address);
        expect(normalizeBytes(result)).to.equal('0x');
      });
    });

    describe('cloneDeterministic', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const salt = web3.utils.randomHex(32);
        const factory = await Clones.new();
        const receipt = await factory.$cloneDeterministic(implementation, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministic_address_bytes32').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const salt = web3.utils.randomHex(32);
        const receipt = await this.factory.$cloneDeterministic(this.implementation, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministic_address_bytes32').args.instance;
        const result = await this.factory.$fetchCloneArgs(address);
        expect(normalizeBytes(result)).to.equal('0x');
      });

      it('revert if address already used', async function () {
        const implementation = web3.utils.randomHex(20);
        const salt = web3.utils.randomHex(32);
        // deploy once
        expectEvent(await this.factory.$cloneDeterministic(implementation, salt), 'return$cloneDeterministic_address_bytes32');
        // deploy twice – should revert (FailedDeployment)
        await expectThorRevert(
          this.factory.$cloneDeterministic(implementation, salt),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      it('address prediction', async function () {
        const implementation = web3.utils.randomHex(20);
        const salt = web3.utils.randomHex(32);
        const predicted = await this.factory.$predictDeterministicAddress(implementation, salt);

        const creationCode = cloneInitCode(implementation);
        expect(computeCreate2Address(salt, creationCode, this.factory.address)).to.be.equal(predicted);

        expectEvent(await this.factory.$cloneDeterministic(implementation, salt), 'return$cloneDeterministic_address_bytes32', {
          instance: predicted,
        });
      });
    });
  });

  // ── with immutable args: 0x ────────────────────────────────────────────────

  describe('with immutable args: 0x', function () {
    const args = '0x';

    describe('clone', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const factory = await Clones.new();
        const receipt = await factory.$cloneWithImmutableArgs(implementation, args);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneWithImmutableArgs_address_bytes').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const receipt = await this.factory.$cloneWithImmutableArgs(this.implementation, args);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneWithImmutableArgs_address_bytes').args.instance;
        expect(normalizeBytes(await this.factory.$fetchCloneArgs(address))).to.equal('0x');
      });
    });

    describe('cloneDeterministic', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const salt = web3.utils.randomHex(32);
        const factory = await Clones.new();
        const receipt = await factory.$cloneDeterministicWithImmutableArgs(implementation, args, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const salt = web3.utils.randomHex(32);
        const receipt = await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32').args.instance;
        expect(normalizeBytes(await this.factory.$fetchCloneArgs(address))).to.equal('0x');
      });

      it('revert if address already used', async function () {
        const salt = web3.utils.randomHex(32);
        expectEvent(
          await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32',
        );
        await expectThorRevert(
          this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      it('address prediction', async function () {
        const salt = web3.utils.randomHex(32);
        const predicted = await this.factory.$predictDeterministicAddressWithImmutableArgs(this.implementation, args, salt);

        // args='0x' uses the cloneWithImmutableArgs initcode (different from standard clone)
        const creationCode = cloneInitCode(this.implementation, args);
        expect(computeCreate2Address(salt, creationCode, this.factory.address)).to.be.equal(predicted);

        expectEvent(
          await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32',
          { instance: predicted },
        );
      });
    });
  });

  // ── with immutable args: 0x11223344 ────────────────────────────────────────

  describe('with immutable args: 0x11223344', function () {
    const args = '0x11223344';

    describe('clone', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const factory = await Clones.new();
        const receipt = await factory.$cloneWithImmutableArgs(implementation, args);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneWithImmutableArgs_address_bytes').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const receipt = await this.factory.$cloneWithImmutableArgs(this.implementation, args);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneWithImmutableArgs_address_bytes').args.instance;
        expect(await this.factory.$fetchCloneArgs(address)).to.equal(args);
      });
    });

    describe('cloneDeterministic', function () {
      shouldBehaveLikeClone(async (implementation, initData, opts = {}) => {
        const salt = web3.utils.randomHex(32);
        const factory = await Clones.new();
        const receipt = await factory.$cloneDeterministicWithImmutableArgs(implementation, args, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32').args.instance;
        await web3.eth.sendTransaction({ from: deployer, to: address, value: opts.value, data: initData });
        return { address };
      });

      it('get immutable arguments', async function () {
        const salt = web3.utils.randomHex(32);
        const receipt = await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt);
        const address = receipt.logs.find(({ event }) => event === 'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32').args.instance;
        expect(await this.factory.$fetchCloneArgs(address)).to.equal(args);
      });

      it('revert if address already used', async function () {
        const salt = web3.utils.randomHex(32);
        expectEvent(
          await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32',
        );
        await expectThorRevert(
          this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      it('address prediction', async function () {
        const salt = web3.utils.randomHex(32);
        const predicted = await this.factory.$predictDeterministicAddressWithImmutableArgs(this.implementation, args, salt);

        const creationCode = cloneInitCode(this.implementation, args);
        expect(computeCreate2Address(salt, creationCode, this.factory.address)).to.be.equal(predicted);

        expectEvent(
          await this.factory.$cloneDeterministicWithImmutableArgs(this.implementation, args, salt),
          'return$cloneDeterministicWithImmutableArgs_address_bytes_bytes32',
          { instance: predicted },
        );
      });
    });
  });

  // ── EIP-170 limit on immutable args ────────────────────────────────────────

  it('EIP-170 limit on immutable args', async function () {
    // EIP-170 limits contract code to 0x6000 bytes; max immutable args = 0x5fd3 bytes
    const args = '0x' + 'ab'.repeat(0x5fd4); // one byte over the limit
    const salt = web3.utils.randomHex(32);
    const implementation = web3.utils.randomHex(20);

    await expectThorRevert(
      this.factory.$predictDeterministicAddressWithImmutableArgs(implementation, args, salt),
      '',
      expectRevertCheckStrategy.unspecified,
    );

    await expectThorRevert(
      this.factory.$cloneWithImmutableArgs(implementation, args),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });
});
