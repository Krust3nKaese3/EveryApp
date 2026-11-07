import { AppRegistry } from 'react-native';
import { everyAppHeadlessTask } from './everyAppHeadlessTask';

AppRegistry.registerHeadlessTask('EveryAppBackgroundTask', () => everyAppHeadlessTask);
