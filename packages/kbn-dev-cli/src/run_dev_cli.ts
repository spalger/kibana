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

import { run, createFlagError, Flags } from '@kbn/dev-utils';

import { CliDevMode } from './cli_dev_mode';

const isString = (v: any): v is string => typeof v === 'string';
const isArrayOfStrings = (v: any): v is string[] => Array.isArray(v) && v.every(isString);

const boolFlag = (flags: Flags, prop: string, name?: string) => {
  const value = flags[prop];
  if (typeof value !== 'boolean') {
    throw createFlagError(`${name ? name : `--${prop}`} should be a boolean`);
  }
  return value;
};

const multiStringFlag = (flags: Flags, prop: string) => {
  const value = flags[prop];

  if (!value) {
    return;
  }

  if (isArrayOfStrings(value)) {
    return value;
  }

  if (isString(value)) {
    return [value];
  }

  throw createFlagError(`expected --${prop} to be one or more strings`);
};

export function runDevCli() {
  run(
    async ({ flags }) => {
      const cache = boolFlag(flags, 'cache', '--no-cache');
      const disableOptimizer = boolFlag(flags, 'disable-optimizer');
      const dist = boolFlag(flags, 'dist');
      const watch = boolFlag(flags, 'watch');
      const oss = boolFlag(flags, 'oss');
      const quiet = boolFlag(flags, 'quiet');
      const silent = boolFlag(flags, 'silent');
      const runExamples = boolFlag(flags, 'run-examples');
      const pluginPaths = multiStringFlag(flags, 'plugin-paths') ?? [];
      const pluginScanDirs = multiStringFlag(flags, 'plugin-scan-dirs');

      const devMode = new CliDevMode({
        cache,
        disableOptimizer,
        dist,
        oss,
        quiet,
        silent,
        pluginPaths,
        pluginScanDirs,
        runExamples,
        watch,
        argv: flags._,
      });

      devMode.start();
    },
    {
      description: `
        Run the Kibana development environment

        Kibana server specific options:
          -- [...flags]      after a "--" any arguments are passed to the Kibana server every time it starts

        @kbn/optimizer specific options:
          --no-cache         disable the optimizer cache
          --dist             build distributable assets
          --disable-optimizer disable the optimizer
      `,
      flags: {
        boolean: [
          'cache',
          'disable-optimizer',
          'dist',
          'watch',
          'oss',
          'quiet',
          'silent',
          'run-examples',
        ],
        string: ['plugin-paths', 'plugin-scan-dirs'],
        default: {
          cache: true,
        },
        help: `
          --watch            Disable file watching in both the server and @kbn/optimizer
          --oss              Only load OSS plugins
          --run-examples     Load the example plugins and build their bundles
        `,
      },
    }
  );
}
