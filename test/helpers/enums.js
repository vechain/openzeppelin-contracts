function Enum(...options) {
  return Object.fromEntries(options.map((key, i) => [key, web3.utils.toBN(i)]));
}

// BigInt variant for use with ethers v6 contracts
function EnumBigInt(...options) {
  return Object.fromEntries(options.map((key, i) => [key, BigInt(i)]));
}

module.exports = {
  Enum,
  EnumBigInt,
  ProposalState: Enum('Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'),
  VoteType: Enum('Against', 'For', 'Abstain'),
  Rounding: Enum('Floor', 'Ceil', 'Trunc', 'Expand'),
  OperationState: Enum('Unset', 'Waiting', 'Ready', 'Done'),
  RevertType: EnumBigInt('None', 'RevertWithoutMessage', 'RevertWithMessage', 'RevertWithCustomError', 'Panic'),
};
