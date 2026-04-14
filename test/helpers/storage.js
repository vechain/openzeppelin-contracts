// erc7201Slot: keccak256(keccak256(keccak256(label) - 1)) & ~0xFF
// This matches ERC-7201 namespace formula
const erc7201Slot = label => {
  // Step 1: keccak256(utf8(label)) = id(label)
  const id = web3.utils.keccak256(label);
  // Step 2: id - 1 as a 32-byte hex value
  const slotMinus1 = (BigInt(id) - 1n).toString(16).padStart(64, '0');
  // Step 3: keccak256(slotMinus1) & ~0xFF
  const hash = web3.utils.keccak256('0x' + slotMinus1);
  const result = BigInt(hash) & ~0xFFn;
  return '0x' + result.toString(16).padStart(64, '0');
};

module.exports = {
  erc7201Slot,
};
