import _ from 'lodash';

import errors from 'ui/errors';
import 'ui/es';
import 'ui/promises';
import 'ui/safe_confirm';
import 'ui/index_patterns';
import uiModules from 'ui/modules';
import Notifier from 'ui/notify/notifier';

import DocSourceProvider from './data_source/doc_source';
import SearchSourceProvider from './data_source/search_source';
import EsSearchStrategyProvider from './fetch_types/es_search_strategy';
import RequestQueueProvider from './_request_queue';
import ErrorHandlersProvider from './_error_handlers';
import FetchProvider from './fetch';
import DocLooperProvider from './looper/doc';
import SearchLooperProvider from './looper/search';
import RootSearchSourceProvider from './data_source/_root_search_source';
import SavedObjectProvider from './saved_object';
import RedirectWhenMissingProvider from './_redirect_when_missing';


uiModules.get('kibana/courier')
.service('courier', function ($rootScope, Private, Promise, indexPatterns) {
  function Courier() {
    var self = this;

    var DocSource = Private(DocSourceProvider);
    var SearchSource = Private(SearchSourceProvider);
    var esSearchStrategy = Private(EsSearchStrategyProvider);

    var requestQueue = Private(RequestQueueProvider);
    var errorHandlers = Private(ErrorHandlersProvider);

    var fetch = Private(FetchProvider);
    var docLooper = self.docLooper = Private(DocLooperProvider);
    var searchLooper = self.searchLooper = Private(SearchLooperProvider);

    // expose some internal modules
    self.setRootSearchSource = Private(RootSearchSourceProvider).set;

    self.SavedObject = Private(SavedObjectProvider);
    self.indexPatterns = indexPatterns;
    self.redirectWhenMissing = Private(RedirectWhenMissingProvider);

    self.DocSource = DocSource;
    self.SearchSource = SearchSource;

    var HastyRefresh = errors.HastyRefresh;

    /**
     * update the time between automatic search requests
     *
     * @chainable
     */
    self.fetchInterval = function (ms) {
      searchLooper.ms(ms);
      return this;
    };

    /**
     * Start fetching search requests on an interval
     * @chainable
     */
    self.start = function () {
      searchLooper.start();
      docLooper.start();
      return this;
    };

    /**
     * Process the pending request queue right now, returns
     * a promise that resembles the success of the fetch completing,
     * individual errors are routed to their respective requests.
     */
    self.fetch = function () {
      fetch.fetchQueued(esSearchStrategy).then(function () {
        searchLooper.restart();
      });
    };


    /**
     * is the currior currently fetching search
     * results automatically?
     *
     * @return {boolean}
     */
    self.started = function () {
      return searchLooper.started();
    };


    /**
     * stop the courier from fetching more search
     * results, does not stop vaidating docs.
     *
     * @chainable
     */
    self.stop = function () {
      searchLooper.stop();
      return this;
    };


    /**
     * create a source object that is a child of this courier
     *
     * @param {string} type - the type of Source to create
     */
    self.createSource = function (type) {
      switch (type) {
        case 'doc':
          return new DocSource();
        case 'search':
          return new SearchSource();
      }
    };

    /**
     * Abort all pending requests
     * @return {[type]} [description]
     */
    self.close = function () {
      searchLooper.stop();
      docLooper.stop();

      _.invoke(requestQueue, 'abort');

      if (requestQueue.length) {
        throw new Error('Aborting all pending requests failed.');
      }
    };

    // Listen for refreshInterval changes
    $rootScope.$watchCollection('timefilter.refreshInterval', function () {
      var refreshValue = _.get($rootScope, 'timefilter.refreshInterval.value');
      var refreshPause = _.get($rootScope, 'timefilter.refreshInterval.pause');
      if (_.isNumber(refreshValue) && !refreshPause) {
        self.fetchInterval(refreshValue);
      } else {
        self.fetchInterval(0);
      }
    });

    var onFatalDefer = Promise.defer();
    onFatalDefer.promise.then(self.close);
    Notifier.fatalCallbacks.push(onFatalDefer.resolve);
  }

  return new Courier();
});
