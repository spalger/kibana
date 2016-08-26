
import bluebird, {
  promisify
} from 'bluebird';
import fs from 'fs';
import _ from 'lodash';
import mkdirp from 'mkdirp';
import path from 'path';
import testSubjSelector from '@spalger/test-subj-selector';
import {
  format,
  parse
} from 'url';

import getUrl from '../../utils/get_url';
import {config, defaultFindTimeout, shieldPage} from '../index';

import {
  Log,
  Try,
} from '../utils';

const mkdirpAsync = promisify(mkdirp);
const writeFileAsync = promisify(fs.writeFile);

export default class Common {

  init(remote) {
    function injectTimestampQuery(func, url) {
      const formatted = modifyQueryString(url, function (parsed) {
        parsed.query._t = Date.now();
      });
      return func.call(this, formatted);
    }

    function removeTimestampQuery(func) {
      return func.call(this)
      .then(function (url) {
        return modifyQueryString(url, function (parsed) {
          parsed.query = _.omit(parsed.query, '_t');
        });
      });
    }

    function modifyQueryString(url, func) {
      const parsed = parse(url, true);
      if (parsed.query === null) {
        parsed.query = {};
      }
      func(parsed);
      return format(_.pick(parsed, 'protocol', 'hostname', 'port', 'pathname', 'query', 'hash', 'auth'));
    }

    this.remote = remote;
    if (remote.get.wrapper !== injectTimestampQuery) {
      this.remote.get = _.wrap(this.remote.get, injectTimestampQuery);
      remote.get.wrapper = injectTimestampQuery;
      this.remote.getCurrentUrl = _.wrap(this.remote.getCurrentUrl, removeTimestampQuery);
    }
  }

  getHostPort() {
    return getUrl.baseUrl(config.servers.kibana);
  }

  getEsHostPort() {
    return getUrl.baseUrl(config.servers.elasticsearch);
  }

  navigateToApp(appName, testStatusPage) {
    const self = this;
    const appUrl = getUrl.noAuth(config.servers.kibana, config.apps[appName]);
    self.debug('navigating to ' + appName + ' url: ' + appUrl);

    function navigateTo(url) {
      return self.try(function () {
        // since we're using hash URLs, always reload first to force re-render
        self.debug('navigate to: ' + url);
        return self.remote.get(url)
        .then(function () {
          return self.sleep(700);
        })
        .then(function () {
          self.debug('returned from get, calling refresh');
          return self.remote.refresh();
        })
        .then(function () {
          self.debug('check testStatusPage');
          if (testStatusPage !== false) {
            self.debug('self.checkForKibanaApp()');
            return self.checkForKibanaApp()
            .then(function (kibanaLoaded) {
              self.debug('kibanaLoaded = ' + kibanaLoaded);
              if (!kibanaLoaded) {
                const msg = 'Kibana is not loaded, retrying';
                self.debug(msg);
                throw new Error(msg);
              }
            });
          }
        })
        .then(function () {
          return self.remote.getCurrentUrl();
        })
        .then(function (currentUrl) {
          const loginPage = new RegExp('login').test(currentUrl);
          if (loginPage) {
            self.debug('Found loginPage = ' + loginPage + ', username = '
              + config.servers.kibana.shield.username);
            return shieldPage.login(config.servers.kibana.shield.username,
              config.servers.kibana.shield.password)
            .then(function () {
              return self.remote.getCurrentUrl();
            });
          } else {
            return currentUrl;
          }
        })
        .then(function (currentUrl) {
          currentUrl = currentUrl.replace(/\/\/\w+:\w+@/, '//');
          const maxAdditionalLengthOnNavUrl = 230;
          // On several test failures at the end of the TileMap test we try to navigate back to
          // Visualize so we can create the next Vertical Bar Chart, but we can see from the
          // logging and the screenshot that it's still on the TileMap page. Why didn't the "get"
          // with a new timestamped URL go? I thought that sleep(700) between the get and the
          // refresh would solve the problem but didn't seem to always work.
          // So this hack fails the navSuccessful check if the currentUrl doesn't match the
          // appUrl plus up to 230 other chars.
          // Navigating to Settings when there is a default index pattern has a URL length of 196
          // (from debug output). Some other tabs may also be long. But a rather simple configured
          // visualization is about 1000 chars long. So at least we catch that case.
          const navSuccessful = new RegExp(appUrl + '.{0,' + maxAdditionalLengthOnNavUrl + '}$')
          .test(currentUrl);

          if (!navSuccessful) {
            const msg = 'App failed to load: ' + appName +
            ' in ' + defaultFindTimeout + 'ms' +
            ' appUrl = ' + appUrl +
            ' currentUrl = ' + currentUrl;
            self.debug(msg);
            throw new Error(msg);
          }

          return currentUrl;
        });
      });
    }

    return navigateTo(appUrl)
    .then(function (currentUrl) {
      let lastUrl = currentUrl;
      return self.try(function () {
        // give the app time to update the URL
        return self.sleep(501)
        .then(function () {
          return self.remote.getCurrentUrl();
        })
        .then(function (currentUrl) {
          self.debug('in navigateTo url = ' + currentUrl);
          if (lastUrl !== currentUrl) {
            lastUrl = currentUrl;
            throw new Error('URL changed, waiting for it to settle');
          }
        });
      });
    });
  }

  runScript(fn, timeout) {
    const self = this;
    // by default, give the app 10 seconds to load
    timeout = timeout || 10000;

    // wait for deps on window before running script
    return self.remote
    .setExecuteAsyncTimeout(timeout)
    .executeAsync(function (done) {
      const interval = setInterval(function () {
        const ready = (document.readyState === 'complete');
        const hasJQuery = !!window.$;

        if (ready && hasJQuery) {
          console.log('doc ready, jquery loaded');
          clearInterval(interval);
          done();
        }
      }, 10);
    }).then(function () {
      return self.remote.execute(fn);
    });
  }

  getApp() {
    const self = this;

    return self.remote.setFindTimeout(defaultFindTimeout)
    .findByCssSelector('.app-wrapper .application')
    .then(function () {
      return self.runScript(function () {
        const $ = window.$;
        const $scope = $('.app-wrapper .application').scope();
        return $scope ? $scope.chrome.getApp() : {};
      });
    });
  }

  checkForKibanaApp() {
    const self = this;

    return self.getApp()
    .then(function (app) {
      const appId = app.id;
      self.debug('current application: ' + appId);
      return appId === 'kibana';
    })
    .catch(function (err) {
      self.debug('kibana check failed');
      self.debug(err);
      // not on the kibana app...
      return false;
    });
  }

  tryForTime(timeout, block) {
    return Try.tryForTime(timeout, block);
  }

  try(block) {
    return Try.try(block);
  }

  log(...args) {
    Log.log(...args);
  }

  debug(...args) {
    Log.debug(...args);
  }

  sleep(sleepMilliseconds) {
    const self = this;
    self.debug('... sleep(' + sleepMilliseconds + ') start');

    return bluebird.resolve().delay(sleepMilliseconds)
    .then(function () { self.debug('... sleep(' + sleepMilliseconds + ') end'); });
  }

  createErrorHandler(testObj) {
    const testName = (testObj.parent) ? [testObj.parent.name, testObj.name].join('_') : testObj.name;
    return error => {
      const now = Date.now();
      const fileName = `failure_${now}_${testName}`;

      return this.saveScreenshot(fileName, true)
      .then(function () {
        throw error;
      });
    };
  }

  async saveScreenshot(fileName, isFailure = false) {
    try {
      const directoryName = isFailure ? 'failure' : 'session';
      const directoryPath = path.resolve(`test/screenshots/${directoryName}`);
      const filePath = path.resolve(directoryPath, `${fileName}.png`);
      this.debug(`Taking screenshot "${filePath}"`);

      const screenshot = await this.remote.takeScreenshot();
      await mkdirpAsync(directoryPath);
      await writeFileAsync(filePath, screenshot);
    } catch (err) {
      this.log(`SCREENSHOT FAILED: ${err}`);
    }
  }

  findTestSubject(selector) {
    this.debug('in findTestSubject: ' + testSubjSelector(selector));
    return this.remote
      .setFindTimeout(defaultFindTimeout)
      .findDisplayedByCssSelector(testSubjSelector(selector));
  }

}
