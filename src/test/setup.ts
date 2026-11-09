// Runs before every test file (see "jest.setupFiles" in package.json).
// Reanimated, Worklets and Gesture Handler need native modules; their own test
// mocks stand in for them. Worklets is mocked first because Reanimated's mock
// loads it.
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
