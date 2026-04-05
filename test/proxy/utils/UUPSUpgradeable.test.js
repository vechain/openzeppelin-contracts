const { expectEvent } = require('@openzeppelin/test-helpers');
const { expectThorRevert, expectRevertCheckStrategy } = require('../../helpers/errors.js');
const ERC1967ProxyUnsafe = artifacts.require('ERC1967ProxyUnsafe');
const UUPSUpgradeableMock = artifacts.require('UUPSUpgradeableMock');
const UUPSUpgradeableUnsafeMock = artifacts.require('UUPSUpgradeableUnsafeMock');
const NonUpgradeableMock = artifacts.require('NonUpgradeableMock');
const UUPSUnsupportedProxiableUUIDMock = artifacts.require('UUPSUnsupportedProxiableUUIDMock');
const Clones = artifacts.require('$Clones');

contract('UUPSUpgradeable', function () {
  before(async function () {
    this.implInitial = await UUPSUpgradeableMock.new();
    this.implUpgradeOk = await UUPSUpgradeableMock.new();
    this.implUpgradeUnsafe = await UUPSUpgradeableUnsafeMock.new();
    this.implUpgradeNonUUPS = await NonUpgradeableMock.new();
    this.implUnsupportedUUID = await UUPSUnsupportedProxiableUUIDMock.new();
    // Used for testing non ERC1967 compliant proxies (clones are proxies that don't use the ERC1967 implementation slot)
    this.cloneFactory = await Clones.new();
  });

  beforeEach(async function () {
    // Use ERC1967ProxyUnsafe to allow empty _data during construction
    const { address } = await ERC1967ProxyUnsafe.new(this.implInitial.address, '0x');
    this.instance = await UUPSUpgradeableMock.at(address);
  });

  it('has an interface version', async function () {
    expect(await this.instance.UPGRADE_INTERFACE_VERSION()).to.equal('5.0.0');
  });

  // it('upgrade to upgradeable implementation', async function () {
  //   const receipt = await this.instance.upgradeToAndCall(this.implUpgradeOk.address, '0x');
  //   expect(receipt.logs.filter(({ event }) => event === 'Upgraded').length).to.be.equal(1);
  //   expectEvent(receipt, 'Upgraded', { implementation: this.implUpgradeOk.address });
  //   expect(await getAddressInSlot(this.instance, ImplementationSlot)).to.be.equal(this.implUpgradeOk.address);
  // });

  // it('upgrade to upgradeable implementation with call', async function () {
  //   expect((await this.instance.current()).toString()).to.equal('0');

  //   const receipt = await this.instance.upgradeToAndCall(
  //     this.implUpgradeOk.address,
  //     this.implUpgradeOk.contract.methods.increment().encodeABI(),
  //   );
  //   expect(receipt.logs.filter(({ event }) => event === 'Upgraded').length).to.be.equal(1);
  //   expectEvent(receipt, 'Upgraded', { implementation: this.implUpgradeOk.address });
  //   expect(await getAddressInSlot(this.instance, ImplementationSlot)).to.be.equal(this.implUpgradeOk.address);

  //   expect((await this.instance.current()).toString()).to.equal('1');
  // });

  it('calling upgradeTo on the implementation reverts', async function () {
    // VeChain: custom error not parseable from raw tx revert; just check revert
    await expectThorRevert(
      this.implInitial.upgradeToAndCall(this.implUpgradeOk.address, '0x'),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('calling upgradeToAndCall on the implementation reverts', async function () {
    await expectThorRevert(
      this.implInitial.upgradeToAndCall(
        this.implUpgradeOk.address,
        this.implUpgradeOk.contract.methods.increment().encodeABI(),
      ),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('calling upgradeToAndCall from a contract that is not an ERC1967 proxy (with the right implementation) reverts', async function () {
    const receipt = await this.cloneFactory.$clone(this.implUpgradeOk.address);
    const instance = await UUPSUpgradeableMock.at(
      receipt.logs.find(({ event }) => event === 'return$clone_address').args.instance,
    );

    await expectThorRevert(
      instance.upgradeToAndCall(this.implUpgradeUnsafe.address, '0x'),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('rejects upgrading to an unsupported UUID', async function () {
    await expectThorRevert(
      this.instance.upgradeToAndCall(this.implUnsupportedUUID.address, '0x'),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('upgrade to and unsafe upgradeable implementation', async function () {
    const receipt = await this.instance.upgradeToAndCall(this.implUpgradeUnsafe.address, '0x');
    expectEvent(receipt, 'Upgraded', { implementation: this.implUpgradeUnsafe.address });
    // Note: getAddressInSlot uses hardhat-network-helpers which doesn't work on VeChain solo node
  });

  // delegate to a non existing upgradeTo function causes a low level revert
  it('reject upgrade to non uups implementation', async function () {
    await expectThorRevert(
      this.instance.upgradeToAndCall(this.implUpgradeNonUUPS.address, '0x'),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('reject proxy address as implementation', async function () {
    const { address } = await ERC1967ProxyUnsafe.new(this.implInitial.address, '0x');
    const otherInstance = await UUPSUpgradeableMock.at(address);

    await expectThorRevert(
      this.instance.upgradeToAndCall(otherInstance.address, '0x'),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });
});
