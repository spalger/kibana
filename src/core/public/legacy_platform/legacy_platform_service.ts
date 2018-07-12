/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { FatalErrorsService } from '../fatal_errors';
import { InjectedMetadataService } from '../injected_metadata';

interface Deps {
  injectedMetadata: ReturnType<InjectedMetadataService['start']>;
  fatalErrors: ReturnType<FatalErrorsService['start']>;
}

export class LegacyPlatformService {
  constructor(
    private rootDomElement: HTMLElement,
    private requireLegacyFiles: () => void,
    private useLegacyTestHarness: boolean = false
  ) {}

  public start({ injectedMetadata, fatalErrors }: Deps) {
    // Inject parts of the new platform into parts of the legacy platform
    // so that legacy APIs/modules can mimic their new platform counterparts
    require('ui/metadata').__newPlatformInit__(injectedMetadata.getLegacyMetadata());
    require('ui/notify/fatal_error').__newPlatformInit__(fatalErrors);

    // Load the bootstrap module before loading the legacy platform files so that
    // the bootstrap module can modify the environment a bit first
    const bootstrapModule = this.loadBootstrapModule();

    // require the files that will tie into the legacy platform
    this.requireLegacyFiles();

    bootstrapModule.bootstrap(this.rootDomElement);
  }

  public stop() {
    const angular = require('angular');

    const angularRoot = angular.element(this.rootDomElement);
    const injector$ = angularRoot.injector();

    // destroy the root angular scope
    injector$.get('$rootScope').$destroy();

    // clear the inner html of the root angular element
    angularRoot.html('');
  }

  private loadBootstrapModule(): {
    bootstrap: (rootDomElement: HTMLElement) => void;
  } {
    if (this.useLegacyTestHarness) {
      // wrapped in NODE_ENV check so the `ui/test_harness` module
      // is not included in the distributable
      if (process.env.NODE_ENV !== 'production') {
        return require('ui/test_harness');
      }

      throw new Error('tests bundle is not available in the distributable');
    }

    return require('ui/chrome');
  }
}
