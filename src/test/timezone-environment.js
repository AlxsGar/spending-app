// A Jest environment that can set the time zone for one test file:
//
//   /**
//    * @jest-environment ./src/test/timezone-environment.js
//    * @jest-environment-options {"timezone": "America/New_York"}
//    */
//
// Why: assigning process.env.TZ inside a test file does nothing, because Jest
// gives tests a COPY of process.env. This file runs in the real worker process
// (outside the sandbox), so its assignment is what Node's Date follows. Jest
// runs one file at a time per worker, and teardown restores the old value.
const { TestEnvironment } = require('jest-environment-node');

class TimezoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.hadTimezone = Object.prototype.hasOwnProperty.call(process.env, 'TZ');
    this.previousTimezone = process.env.TZ;
    const timezone = config.projectConfig.testEnvironmentOptions.timezone;
    if (timezone) process.env.TZ = timezone;
  }

  async teardown() {
    if (this.hadTimezone) {
      process.env.TZ = this.previousTimezone;
    } else {
      delete process.env.TZ;
    }
    await super.teardown();
  }
}

module.exports = TimezoneEnvironment;
