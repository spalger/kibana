/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { deleteList } from '@kbn/securitysolution-list-api';
import { withOptionalSignal } from '../with_optional_signal';
import { useAsync } from '../use_async';

const deleteListWithOptionalSignal = withOptionalSignal(deleteList);

export const useDeleteList = () => useAsync(deleteListWithOptionalSignal);
