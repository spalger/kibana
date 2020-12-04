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

import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';

import * as Rx from 'rxjs';
import { tap, subscribeOn } from 'rxjs/operators';

export class DevCliChildServer extends HttpServer {
  private subscription?: Rx.Subscription;

  listen(...args: any[]) {
    if (this.subscription) {
      throw new Error('Server is already listening');
    }

    this.subscription = Rx.merge(
      Rx.fromEvent<any[]>(process as EventEmitter, 'message').pipe(
        tap(([msg, handle]) => {
          if (Array.isArray(msg) && msg[0] === 'SERVER_CONNECTION') {
            this.emit('connection', handle);
          }
        })
      ),

      // send listening message and call the callback async
      Rx.defer(() => {
        process.send!(['SERVER_LISTENING']);

        const cb = args[args.length - 1];
        if (typeof cb === 'function') {
          cb();
        }
      }).pipe(subscribeOn(Rx.asyncScheduler))
    ).subscribe({
      error: (error) => {
        this.emit('error', error);
      },
    });

    return this;
  }

  close(cb?: () => void) {
    this.subscription?.unsubscribe();

    process.send!(['SERVER_CLOSED']);

    if (cb) {
      process.nextTick(cb);
    }

    return this;
  }
}
