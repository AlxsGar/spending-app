// Failure-path tests make the app log a diagnostic console.error (the stores
// and db.ts report errors that the screens only show as a generic message).
// Call this once at the top of such a test file: console.error is replaced by a
// spy in each test, so the run stays quiet, and the returned function gives the
// spy so a test can assert what was logged. Nothing is silenced otherwise.
export function silenceConsoleError(): () => jest.SpyInstance {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });
  return () => spy;
}
