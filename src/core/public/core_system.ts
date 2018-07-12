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

import { InjectedMetadata, InjectedMetadataService } from './injected_metadata';
import { LegacyPlatformService } from './legacy_platform';

interface Params {
  rootDomElement: HTMLElement;
  injectedMetadata: InjectedMetadata;
  requireLegacyFiles: () => void;
  useLegacyTestHarness?: boolean;
}

export class CoreSystem {
  private injectedMetadata: InjectedMetadataService;
  private legacyPlatform: LegacyPlatformService;

  constructor(params: Params) {
    const { rootDomElement, injectedMetadata, requireLegacyFiles, useLegacyTestHarness } = params;

    this.injectedMetadata = new InjectedMetadataService(injectedMetadata);
    this.legacyPlatform = new LegacyPlatformService(
      rootDomElement,
      requireLegacyFiles,
      useLegacyTestHarness
    );
  }

  public start() {
    this.legacyPlatform.start({
      injectedMetadata: this.injectedMetadata.start(),
    });
  }
}
