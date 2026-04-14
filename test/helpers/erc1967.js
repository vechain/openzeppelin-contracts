// Note: @nomicfoundation/hardhat-network-helpers getStorageAt/setStorageAt only
// work on Hardhat Network, not on VeChain solo. We use web3.eth.getStorageAt for
// reads (supported by Thor via the ETH compatibility layer) and rely on contract
// calls for writes.

const { setStorageAt } = require('@nomicfoundation/hardhat-network-helpers');

const ImplementationLabel = 'eip1967.proxy.implementation';
const AdminLabel = 'eip1967.proxy.admin';
const BeaconLabel = 'eip1967.proxy.beacon';

function labelToSlot(label) {
  return '0x' + web3.utils.toBN(web3.utils.keccak256(label)).subn(1).toString(16);
}

async function getSlot(address, slot) {
  const addr = web3.utils.isAddress(address) ? address : address.address;
  const slotHex = web3.utils.isHex(slot) ? slot : labelToSlot(slot);
  return web3.eth.getStorageAt(addr, slotHex);
}

function setSlot(address, slot, value) {
  const hexValue = web3.utils.isHex(value) ? value : web3.utils.toHex(value);

  return setStorageAt(
    web3.utils.isAddress(address) ? address : address.address,
    web3.utils.isHex(slot) ? slot : labelToSlot(slot),
    web3.utils.padLeft(hexValue, 64),
  );
}

async function getAddressInSlot(address, slot) {
  const slotValue = await getSlot(address, slot);
  // slotValue may be a 32-byte hex; extract last 20 bytes (40 hex chars)
  const hex = slotValue.replace(/^0x/, '').padStart(64, '0');
  return web3.utils.toChecksumAddress('0x' + hex.slice(-40));
}

module.exports = {
  ImplementationLabel,
  AdminLabel,
  BeaconLabel,
  ImplementationSlot: labelToSlot(ImplementationLabel),
  AdminSlot: labelToSlot(AdminLabel),
  BeaconSlot: labelToSlot(BeaconLabel),
  setSlot,
  getSlot,
  getAddressInSlot,
};
