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

// @ts-ignore Types for EuiCallOut, EuiCodeBlock, and EuiEmptyPrompt missing https://github.com/elastic/eui/pull/1010
import { EuiButton, EuiButtonEmpty, EuiCallOut, EuiCodeBlock, EuiEmptyPrompt } from '@elastic/eui';
import React from 'react';
import * as Rx from 'rxjs';
import { tap } from 'rxjs/operators';

import { ErrorInfo } from './get_error_info';

interface Props {
  kibanaVersion: string;
  buildNumber: number;
  errorInfo$: Rx.Observable<ErrorInfo>;
}

interface State {
  errors: ErrorInfo[];
}

export class FatalErrorsScreen extends React.Component<Props, State> {
  public state: State = {
    errors: [],
  };

  private subscription?: Rx.Subscription;

  public componentDidMount() {
    // reload the page if hash-based navigation is attempted
    window.addEventListener('hashchange', () => {
      window.location.reload();
    });

    // consume error notifications and set them to the component state
    this.subscription = this.props.errorInfo$
      .pipe(
        tap(error => {
          this.setState(state => {
            const isDuplicate = state.errors.some(
              existing => JSON.stringify(existing) === JSON.stringify(error)
            );

            if (isDuplicate) {
              return state;
            }

            return {
              ...state,
              errors: [...state.errors, error],
            };
          });
        })
      )
      .subscribe({
        error(error) {
          // tslint:disable-next-line no-console
          console.error('Uncaught error in fatal error screen internals', error);
        },
      });
  }

  public componentWillUnmount() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = undefined;
    }
  }

  public render() {
    return (
      <>
        <EuiEmptyPrompt
          iconType="alert"
          iconColor="danger"
          title={<h2>Oops!</h2>}
          body={<p>Looks like something went wrong. Refreshing may do the trick.</p>}
          actions={
            <>
              <EuiButton color="primary" fill onClick={this.onClickClearSession}>
                Clear your session
              </EuiButton>
              <EuiButtonEmpty onClick={this.onClickGoBack}>Go Back</EuiButtonEmpty>
            </>
          }
        />

        {this.state.errors.map((error, i) => (
          <EuiCallOut key={i} title={error.message} color="danger" iconType="cross">
            <EuiCodeBlock>
              {`Version: ${this.props.kibanaVersion}` +
                '\n' +
                `Build: ${this.props.buildNumber}` +
                '\n' +
                (error.stack ? error.stack : '')}
            </EuiCodeBlock>
          </EuiCallOut>
        ))}
      </>
    );
  }

  private onClickGoBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    window.history.back();
  };

  private onClickClearSession = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    window.location.reload();
  };
}
