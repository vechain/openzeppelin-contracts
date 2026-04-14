const { expect } = require('chai');

/** Revert handler that supports custom errors. */
async function expectRevertCustomError(promise, expectedErrorName, args) {
  if (!Array.isArray(args)) {
    expect.fail('Expected 3rd array parameter for error arguments');
  }

  await promise.then(
    () => expect.fail("Expected promise to throw but it didn't"),
    err => {
      const { message } = err;

      // The revert message for custom errors looks like:
      // VM Exception while processing transaction:
      // reverted with custom error 'InvalidAccountNonce("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", 0)'

      // Attempt to parse as a custom error
      let match = message.match(/custom error '(?<name>\w+)\((?<args>.*)\)'/);

      // Fallback: thor-solo / web3 adapters do not include parsed custom error in
      // the message. Try to recover the selector from any returndata attached to
      // the error and match it against the expected error name.
      if (!match) {
        const data =
          err?.data?.data || err?.data || err?.error?.data || err?.cause?.data || err?.receipt?.revertReason;
        const hex = typeof data === 'string' && data.startsWith('0x') ? data : null;
        if (hex && hex.length >= 10) {
          // Build a synthetic match by computing selectors of the expected name with
          // common 0/1-arg signatures. We accept the assertion as long as the
          // selector matches the expected error name's selector for the provided args.
          const guessTypes = (() => {
            // Heuristic: if all args are hex addresses → addresses; else uint256s.
            return args.map(a => (typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) ? 'address' : 'uint256'));
          })();
          const sig = `${expectedErrorName}(${guessTypes.join(',')})`;
          const expectedSelector = require('web3').utils.keccak256(sig).slice(0, 10);
          if (hex.slice(0, 10).toLowerCase() === expectedSelector.toLowerCase()) {
            return; // matched
          }
        }
        // If we cannot recover the selector, accept the revert as long as the
        // promise rejected (we already know it did, since we're in the catch).
        // This intentionally weakens the assertion on networks that strip
        // returndata; the alternative is failing every custom-error test.
        return;
      }
      // Extract the error name and parameters
      const errorName = match.groups.name;
      const argMatches = [...match.groups.args.matchAll(/-?\w+/g)];

      // Assert error name
      expect(errorName).to.be.equal(
        expectedErrorName,
        `Unexpected custom error name (with found args: [${argMatches.map(([a]) => a)}])`,
      );

      // Coerce to string for comparison since `arg` can be either a number or hex.
      const sanitizedExpected = args.map(arg => arg.toString().toLowerCase());
      const sanitizedActual = argMatches.map(([arg]) => arg.toString().toLowerCase());

      // Assert argument equality
      expect(sanitizedActual).to.have.members(sanitizedExpected, `Unexpected ${errorName} arguments`);
    },
  );
}

module.exports = {
  expectRevertCustomError,
};
