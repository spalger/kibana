import UiModules from 'ui/modules';
import { once, clone } from 'lodash';

import toggleHtml from './kbn_global_timepicker.html';

UiModules
.get('kibana')
.directive('kbnGlobalTimepicker', (timefilter, globalState, $rootScope) => {
  const listenForUpdates = once($scope => {
    $scope.$listen(timefilter, 'update', () => {
      globalState.time = clone(timefilter.time);
      globalState.refreshInterval = clone(timefilter.refreshInterval);
      globalState.save();
    });
  });

  return {
    template: toggleHtml,
    link: () => {
      listenForUpdates($rootScope);

      $rootScope.timefilter = timefilter;
      $rootScope.toggleRefresh = () => {
        timefilter.refreshInterval.pause = !timefilter.refreshInterval.pause;
      };
    },
  };
});
