const { expect } = require('chai');

async function expectException(promise, expectedError, checkStrategy) {
  try {
    await promise;
  } catch (error) {
    if (error.message.indexOf(expectedError) === -1) {
      // When the exception was a revert, the resulting string will include only
      // the revert reason, otherwise it will be the type of exception (e.g. 'invalid opcode')
      const actualError = error.message.replace(
        /Returned error: VM Exception while processing transaction: (revert )?/,
        '',
      );
      checkStrategy(actualError, expectedError);
    }
    return;
  }

  expect.fail('Expected an exception but none was received');
}

const expectThorRevert = async function (promise, expectedError, checkStrategy) {
  promise.catch(() => {}); // Avoids uncaught promise rejections in case an input validation causes us to return early

  await expectException(promise, expectedError, checkStrategy);
};

const expectRevertCheckStrategy = {
  contains: function (actualError, expectedError) {
    expect(actualError).to.have.string(expectedError, 'Wrong kind of exception received');
  },
  unspecified: function () {},
};

module.exports = {
  expectThorRevert,
  expectRevertCheckStrategy,
};