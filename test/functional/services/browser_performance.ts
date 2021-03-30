/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import Fs from 'fs/promises';
import { createWriteStream, openSync } from 'fs';
import { inspect } from 'util';

import * as Rx from 'rxjs';
import { filter } from 'rxjs/operators';
import { firstValueFrom } from '@kbn/std';
import puppeteer, { CDPSession } from 'puppeteer';
import { WebDriver } from 'selenium-webdriver';
import { ToolingLog } from '@kbn/dev-utils';
import { Lifecycle } from '@kbn/test/types/ftr';

import { FtrProviderContext } from '../ftr_provider_context';

export class BrowserPerformance {
  private static async getBrowserUrl(wd: WebDriver) {
    const caps = await wd.getCapabilities();
    const seCdp = caps.get('se:cdp');
    const vendorInfo =
      // @ts-expect-error exists but not documented/typed
      caps.get(wd.VENDOR_COMMAND_PREFIX + ':chromeOptions') ||
      // @ts-expect-error exists but not documented/typed
      caps.get(wd.VENDOR_CAPABILITY_PREFIX + ':edgeOptions') ||
      caps.get('moz:debuggerAddress') ||
      {};

    const withoutProtocol = seCdp || vendorInfo.debuggerAddress;
    if (!withoutProtocol) {
      throw new Error('unable to determine debugger address for browser');
    }

    return `http://${withoutProtocol}`;
  }

  static async fromWd(wd: WebDriver, recordDir: string, log: ToolingLog, lifecycle: Lifecycle) {
    const browser = await puppeteer.connect({
      browserURL: await this.getBrowserUrl(wd),
    });

    const pages = (await browser.targets()).filter((t) => t.type() === 'page');

    if (pages.length !== 1) {
      throw new Error(`There are ${pages.length} "page" targets, expected 1: ${inspect(pages)}`);
    }

    return new BrowserPerformance(await pages[0].createCDPSession(), recordDir, log, lifecycle);
  }

  private currentReportName$ = new Rx.BehaviorSubject<undefined | string>(undefined);

  constructor(
    private readonly cdp: CDPSession,
    private readonly recordDir: string,
    private readonly log: ToolingLog,
    lifecycle: Lifecycle
  ) {
    // delay shutdown until the current report name is cleared
    lifecycle.cleanup.add(async () => {
      await this.waitForNothingInProgress();
    });

    this.cdp.on('Tracing.bufferUsage', ({ percentFull }) => {
      this.log.info(`[${this.currentReportName$.getValue()}] tracing buffer ${percentFull}% full`);
    });

    this.cdp.on('Tracing.tracingComplete', ({ dataLossOccurred, stream }) => {
      this.log.info(`[${this.currentReportName$.getValue()}] tracing complete`);
      if (dataLossOccurred) {
        this.log.error('DATA LOSS OCCURRED IN TRACE');
      }
      this.createRecording(stream);
    });
  }

  async waitForNothingInProgress() {
    await firstValueFrom(this.currentReportName$.pipe(filter((n) => n === undefined)));
  }

  private async createRecording(handle: string) {
    try {
      const name = this.currentReportName$.getValue() ?? 'unnamed trace';
      let counter = -1;
      const pathBase = Path.resolve(this.recordDir, name);
      const ext = '.trace';

      await Fs.mkdir(Path.dirname(pathBase), { recursive: true });

      let fd: number | undefined;
      let path;
      while (!path || !fd) {
        counter++;
        path = counter > 0 ? `${pathBase}__${counter}${ext}` : `${pathBase}${ext}`;
        try {
          // TODO: is this going to be super slow if we have hundreds of recorded instances?
          fd = openSync(path, 'wx');
        } catch (error) {
          if (error.code === 'EEXIST') {
            continue;
          }

          throw error;
        }
      }

      this.log.info('writing trace to', path);
      const output = createWriteStream('', { fd, autoClose: true });
      try {
        while (true) {
          const chunk = (await this.cdp.send('IO.read', {
            handle,
          })) as {
            base64Encoded: boolean;
            data: string;
            eof: boolean;
          };

          output.write(chunk.data, chunk.base64Encoded ? 'base64' : 'utf-8');
          if (chunk.eof) {
            break;
          }
        }
      } finally {
        output.end();
      }
    } finally {
      try {
        await this.cdp.send('IO.close', { handle });
      } catch (error) {
        this.log.error('Failure when trying to close the trace IO stream');
        this.log.error(error);
      }

      this.currentReportName$.next(undefined);
    }
  }

  async recordPerf<T>(name: string, block: () => Promise<T>): Promise<T> {
    if (this.currentReportName$.getValue() !== undefined) {
      throw new Error(`browserPerformance.recordPerf() can't be nested`);
    }

    this.currentReportName$.next(name);
    this.log.info('starting trace...');

    await this.cdp.send('Tracing.start', {
      bufferUsageReportingInterval: 750,
      transferMode: 'ReturnAsStream',
      streamFormat: 'json',
      streamCompression: 'none',
      traceConfig: {
        recordMode: 'recordUntilFull',
        enableSampling: true,
        includedCategories: [
          'blink',
          'cc',
          'netlog',
          'renderer.scheduler',
          'sequence_manager',
          'toplevel',
          'v8',
        ],
        excludedCategories: [],
      },
    });

    try {
      return await block();
    } finally {
      try {
        await this.cdp.send('Tracing.end');
      } catch (error) {
        this.log.error('failed to end tracing!');
        this.log.error(error);
      }
    }
  }
}

export async function BrowserPerformanceProvider({ getService }: FtrProviderContext) {
  const wd = await getService('__webdriver__').init();
  const config = getService('config');
  const log = getService('log');
  const lifecycle = getService('lifecycle');

  return BrowserPerformance.fromWd(
    wd.driver,
    config.get('browserPerf.recordingDir'),
    log,
    lifecycle
  );
}
