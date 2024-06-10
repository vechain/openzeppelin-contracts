const { time, expectRevert } = require('@openzeppelin/test-helpers');
const {
  mine,
} = require('@nomicfoundation/hardhat-network-helpers');

// ============ COMMON PATHS ============

const COMMON_IS_EXECUTING_PATH = {
  executing() {
    it('succeeds', async function () {
      await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
    });
  },
  notExecuting() {
    it('reverts as AccessManagerUnauthorizedAccount', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
      );
    });
  },
};

const COMMON_GET_ACCESS_PATH = {
  requiredRoleIsGranted: {
    roleGrantingIsDelayed: {
      callerHasAnExecutionDelay: {
        beforeGrantDelay() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
            );
          });
        },
        afterGrantDelay: undefined, // Diverges if there's an operation delay or not
      },
      callerHasNoExecutionDelay: {
        beforeGrantDelay() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
            );
          });
        },
        afterGrantDelay() {
          it('succeeds called directly', async function () {
            await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
          });

          it('succeeds via execute', async function () {
            await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
          });
        },
      },
    },
    roleGrantingIsNotDelayed: {
      callerHasAnExecutionDelay: undefined, // Diverges if there's an operation to schedule or not
      callerHasNoExecutionDelay() {
        it('succeeds called directly', async function () {
          await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
        });

        it('succeeds via execute', async function () {
          await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
        });
      },
    },
  },
  requiredRoleIsNotGranted() {
    it('reverts as AccessManagerUnauthorizedAccount', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
      );
    });
  },
};

const COMMON_SCHEDULABLE_PATH = {
  scheduled: {
    before() {
      it('reverts as AccessManagerNotReady', async function () {
        await expectRevert.unspecified(
          web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
        );
      });
    },
    after() {
      it('succeeds called directly', async function () {
        await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
      });

      it('succeeds via execute', async function () {
        await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
      });
    },
    expired() {
      it('reverts as AccessManagerExpired', async function () {
        await expectRevert.unspecified(
          web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
        );
      });
    },
  },
  notScheduled() {
    it('reverts as AccessManagerNotScheduled', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
      );
    });
  },
};

const COMMON_SCHEDULABLE_PATH_IF_ZERO_DELAY = {
  scheduled: {
    before() {
      it.skip('is not reachable without a delay');
    },
    after() {
      it.skip('is not reachable without a delay');
    },
    expired() {
      it.skip('is not reachable without a delay');
    },
  },
  notScheduled() {
    it('succeeds', async function () {
      await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
    });
  },
};

// ============ OPERATION HELPERS ============

/**
 * @requires this.{manager,scheduleIn,caller,target,calldata}
 */
function shouldBehaveLikeSchedulableOperation({ notScheduled }) {
  describe('when operation is not scheduled', function () {
    beforeEach('set expected operationId', async function () {
      this.operationId = await this.manager.hashOperation(this.caller, this.target.address, this.calldata);

      // Assert operation is not scheduled
      expect(await this.manager.getSchedule(this.operationId)).to.be.bignumber.equal(web3.utils.toBN(0));
    });

    notScheduled();
  });
}

/**
 * @requires this.{manager,roles,target,calldata}
 */
function shouldBehaveLikeARestrictedOperation({ callerIsNotTheManager }) {
  describe('when the call does not come from the manager (msg.sender != manager)', function () {
    beforeEach('define non manager caller', function () {
      this.caller = this.roles.SOME.members[0];
    });

    callerIsNotTheManager();
  });
}

/**
 * @requires this.{manager,roles,executionDelay,operationDelay,target}
 */
function shouldBehaveLikeDelayedOperation() {
  describe('with operation delay', function () {
    describe('when operation delay is greater than execution delay', function () {
      beforeEach('set operation delay', async function () {
        this.operationDelay = this.executionDelay.add(time.duration.hours(1));
        await this.manager.$_setTargetAdminDelay(this.target.address, this.operationDelay);
        this.scheduleIn = this.operationDelay; // For shouldBehaveLikeSchedulableOperation
      });

      shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
    });

    describe('when operation delay is shorter than execution delay', function () {
      beforeEach('set operation delay', async function () {
        this.operationDelay = this.executionDelay.sub(time.duration.hours(1));
        await this.manager.$_setTargetAdminDelay(this.target.address, this.operationDelay);
        this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
      });

      shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
    });
  });

  describe('without operation delay', function () {
    beforeEach('set operation delay', async function () {
      this.operationDelay = web3.utils.toBN(0);
      await this.manager.$_setTargetAdminDelay(this.target.address, this.operationDelay);
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });

    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  });
}


/**
 * @requires this.{target,calldata,roles,role}
 */
function shouldBehaveLikeHasRole({ publicRoleIsRequired, specificRoleIsRequired }) {
  describe('when the function requires the caller to be granted with the PUBLIC_ROLE', function () {
    beforeEach('set target function role as PUBLIC_ROLE', async function () {
      this.role = this.roles.PUBLIC;
      await this.manager.$_setTargetFunctionRole(this.target.address, this.calldata.substring(0, 10), this.role.id, {
        from: this.roles.ADMIN.members[0],
      });
    });

    publicRoleIsRequired();
  });

  describe('when the function requires the caller to be granted with a role other than PUBLIC_ROLE', function () {
    beforeEach('set target function role as PUBLIC_ROLE', async function () {
      await this.manager.$_setTargetFunctionRole(this.target.address, this.calldata.substring(0, 10), this.role.id, {
        from: this.roles.ADMIN.members[0],
      });
    });

    shouldBehaveLikeGetAccess(specificRoleIsRequired);
  });
}

/**
 * @requires this.{manager,role,caller}
 */
function shouldBehaveLikeGetAccess({
  requiredRoleIsGranted: {
    roleGrantingIsNotDelayed: { callerHasAnExecutionDelay: case5, callerHasNoExecutionDelay: case6 },
  },
  requiredRoleIsNotGranted,
}) {
  describe('when the required role is granted to the caller', function () {
    describe('when role granting is not delayed', function () {
      beforeEach('define delay', function () {
        this.grantDelay = web3.utils.toBN(0);
      });

      describe('when caller has an execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = time.duration.hours(10);
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        case5();
      });

      describe('when caller has no execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = web3.utils.toBN(0);
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        case6();
      });
    });
  });

  describe('when role is not granted', function () {
    // Because this helper can be composed with other helpers, it's possible
    // that role has been set already by another helper.
    // Although this is highly unlikely, we check for it here to avoid false positives.
    beforeEach('assert role is unset', async function () {
      const { since } = await this.manager.getAccess(this.role.id, this.caller);
      expect(since).to.be.bignumber.equal(web3.utils.toBN(0));
    });

    requiredRoleIsNotGranted();
  });
}

// ============ ADMIN OPERATION HELPERS ============

/**
 * @requires this.{manager,roles,calldata,role}
 */
function shouldBehaveLikeDelayedAdminOperation() {
  const getAccessPath = COMMON_GET_ACCESS_PATH;
  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasAnExecutionDelay.afterGrantDelay = function () {
    beforeEach('consume previously set grant delay', async function () {
      // Consume previously set delay
      await mine();
    });
    shouldBehaveLikeDelayedOperation();
  };
  getAccessPath.requiredRoleIsGranted.roleGrantingIsNotDelayed.callerHasAnExecutionDelay = function () {
    beforeEach('set execution delay', async function () {
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeDelayedOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };

  beforeEach('set target as manager', function () {
    this.target = this.manager;
  });

  shouldBehaveLikeARestrictedOperation({
    callerIsTheManager: COMMON_IS_EXECUTING_PATH,
    callerIsNotTheManager() {
      shouldBehaveLikeHasRole({
        publicRoleIsRequired() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
            );
          });
        },
        specificRoleIsRequired: getAccessPath,
      });
    },
  });
}

/**
 * @requires this.{manager,roles,calldata,role}
 */
function shouldBehaveLikeNotDelayedAdminOperation() {
  const getAccessPath = COMMON_GET_ACCESS_PATH;
  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasAnExecutionDelay.afterGrantDelay = function () {
    beforeEach('set execution delay', async function () {
      await mine();
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };
  getAccessPath.requiredRoleIsGranted.roleGrantingIsNotDelayed.callerHasAnExecutionDelay = function () {
    beforeEach('set execution delay', async function () {
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };

  beforeEach('set target as manager', function () {
    this.target = this.manager;
  });

  shouldBehaveLikeARestrictedOperation({
    callerIsTheManager: COMMON_IS_EXECUTING_PATH,
    callerIsNotTheManager() {
      shouldBehaveLikeHasRole({
        publicRoleIsRequired() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
            );
          });
        },
        specificRoleIsRequired: getAccessPath,
      });
    },
  });
}

/**
 * @requires this.{manager,roles,calldata,role}
 */
function shouldBehaveLikeRoleAdminOperation() {
  const getAccessPath = COMMON_GET_ACCESS_PATH;
  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasAnExecutionDelay.afterGrantDelay = function () {
    beforeEach('set operation delay', async function () {
      await mine();
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };
  getAccessPath.requiredRoleIsGranted.roleGrantingIsNotDelayed.callerHasAnExecutionDelay = function () {
    beforeEach('set execution delay', async function () {
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };

  beforeEach('set target as manager', function () {
    this.target = this.manager;
  });

  shouldBehaveLikeARestrictedOperation({
    callerIsTheManager: COMMON_IS_EXECUTING_PATH,
    callerIsNotTheManager() {
      shouldBehaveLikeHasRole({
        publicRoleIsRequired() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
            );
          });
        },
        specificRoleIsRequired: getAccessPath,
      });
    },
  });
}

// ============ RESTRICTED OPERATION HELPERS ============

/**
 * @requires this.{manager,roles,calldata,role}
 */
function shouldBehaveLikeAManagedRestrictedOperation() {
  function revertUnauthorized() {
    it('reverts as AccessManagedUnauthorized', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller })
      );
    });
  }

  const getAccessPath = COMMON_GET_ACCESS_PATH;

  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasAnExecutionDelay.beforeGrantDelay =
    revertUnauthorized;
  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasNoExecutionDelay.beforeGrantDelay =
    revertUnauthorized;
  getAccessPath.requiredRoleIsNotGranted = revertUnauthorized;

  getAccessPath.requiredRoleIsGranted.roleGrantingIsDelayed.callerHasAnExecutionDelay.afterGrantDelay = function () {
    beforeEach('consume previously set grant delay', async function () {
      // Consume previously set delay
      await mine();
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };
  getAccessPath.requiredRoleIsGranted.roleGrantingIsNotDelayed.callerHasAnExecutionDelay = function () {
    beforeEach('consume previously set grant delay', async function () {
      this.scheduleIn = this.executionDelay; // For shouldBehaveLikeSchedulableOperation
    });
    shouldBehaveLikeSchedulableOperation(COMMON_SCHEDULABLE_PATH);
  };

  const isExecutingPath = COMMON_IS_EXECUTING_PATH;
  isExecutingPath.notExecuting = revertUnauthorized;
}

module.exports = {
  // COMMON PATHS
  COMMON_SCHEDULABLE_PATH,
  COMMON_SCHEDULABLE_PATH_IF_ZERO_DELAY,
  // OPERATION HELPERS
  shouldBehaveLikeSchedulableOperation,
  // METHOD HELPERS
  shouldBehaveLikeGetAccess,
  shouldBehaveLikeHasRole,
  // ADMIN OPERATION HELPERS
  shouldBehaveLikeDelayedAdminOperation,
  shouldBehaveLikeNotDelayedAdminOperation,
  shouldBehaveLikeRoleAdminOperation,
  // RESTRICTED OPERATION HELPERS
  shouldBehaveLikeAManagedRestrictedOperation,
};
