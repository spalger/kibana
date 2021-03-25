/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

export type BrowserType = 'chrome' | 'firefox' | 'msedge';

export function parseBrowserType(input: any): BrowserType {
  if (input === 'chrome' || input === 'firefox' || input === 'msedge') {
    return input;
  }

  throw new Error(
    `invalid browser input [${input}], expected either "chrome", "firefox", or "msedge"`
  );
}

export function isChromeBased(type: BrowserType): type is 'chrome' | 'msedge' {
  return type === 'chrome' || type === 'msedge';
}
