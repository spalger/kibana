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

import { Socket } from 'net';

import * as Rx from 'rxjs';
import { tap } from 'rxjs/operators';

export class SocketBuffer {
  private readonly subject$ = new Rx.Subject<Socket>();
  private readonly buffer = new Set<{ sub: Rx.Subscription; socket: Socket }>();
  private corked = true;

  public readonly socket$ = this.subject$.asObservable();

  constructor(private readonly source$: Rx.Observable<Socket>) {}

  subscribe(subscriber: Rx.Subscriber<never>) {
    subscriber.add(() => {
      for (const b of this.buffer) {
        b.sub.unsubscribe();
      }
      this.buffer.clear();
    });

    return this.source$.subscribe({
      next: (socket) => {
        if (!this.corked) {
          this.subject$.next(socket);
          return;
        }

        const buffered = {
          socket,
          sub: new Rx.Subscription(),
        };
        this.buffer.add(buffered);

        buffered.sub.add(
          Rx.merge(
            Rx.fromEvent(socket, 'error').pipe(
              tap((error) => {
                subscriber.error(error);
              })
            ),
            Rx.fromEvent(socket, 'close').pipe(
              tap(() => {
                this.buffer.delete(buffered);
              })
            )
          ).subscribe()
        );
      },
      error: (error) => {
        subscriber.error(error);
      },
      complete: () => {
        subscriber.complete();
      },
    });
  }

  cork() {
    this.corked = true;
  }

  uncork() {
    this.corked = false;
    const toSend = Array.from(this.buffer);
    this.buffer.clear();

    for (const { socket, sub } of toSend) {
      sub.unsubscribe();
      this.subject$.next(socket);
    }
  }
}
