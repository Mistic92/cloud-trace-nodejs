// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * The main entry point for cross-platform build scripts.
 * Usage (in repository root directory):
 *   ts-node -P ./scripts ./scripts [step1] [step2 ... stepN]
 * Alias for above:
 *   npm run script [step1] [step2 ... stepN]
 */

const [, , ...steps] = process.argv;
const {
  TRACE_TEST_EXCLUDE_INTEGRATION,
  TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_KEY,
  TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_IV,
} = process.env;

import {checkInstall} from './check-install';
import {compile} from './compile';
import {encryptCredentials, decryptCredentials} from './credentials';
import {getPluginTypes} from './get-plugin-types';
import {initTestFixtures} from './init-test-fixtures';
import {reportCoverage} from './report-coverage';
import {runTests} from './run-tests';
import {testNonInterference} from './test-non-interference';
import {BUILD_DIRECTORY, spawnP} from './utils';

// The identifying components in the service account credentials file path.
const projectID = 'long-door-651';
const keyID = 'a179efbeda21';

// Globs to exclude when running unit tests only.
const unitTestExcludeGlobs: string[] = TRACE_TEST_EXCLUDE_INTEGRATION
  ? [
      `${BUILD_DIRECTORY}/test/plugins/test-*`,
      `${BUILD_DIRECTORY}/test/test-agent-stopped.js`,
      `${BUILD_DIRECTORY}/test/test-grpc-async-handler.js`,
      `${BUILD_DIRECTORY}/test/test-grpc-context.js`,
      `${BUILD_DIRECTORY}/test/test-mysql-pool.js`,
      `${BUILD_DIRECTORY}/test/test-plugins-*`,
      `${BUILD_DIRECTORY}/test/test-trace-hapi-tails.js`,
      `${BUILD_DIRECTORY}/test/test-trace-web-frameworks.js`,
      `${BUILD_DIRECTORY}/test/test-unpatch.js`,
    ]
  : [];

/**
 * Sequentially runs a list of commands.
 */
async function run(steps: string[]) {
  for (const step of steps) {
    console.log(`> Running step: ${step}`);
    // If the step string is prefixed with "npm-", treat it as an "npm run"
    // command, and then short-circuit.
    if (step.indexOf('npm-') === 0) {
      const moduleAndArgs = step.split('-');
      await spawnP('npm', ['run', moduleAndArgs.slice(1).join('-')]);
      continue;
    } else if (step.startsWith('compile-')) {
      const [, languageLevel, strict] = step.split('-');
      await compile({strict: !!strict, languageLevel});
      continue;
    } else {
      switch (step) {
        case 'check-install':
          await checkInstall();
          break;
        case 'encrypt-service-account-credentials': {
          const keyAndIV = await encryptCredentials(
            `${projectID}-${keyID}.json`
          );
          console.log(
            [`key: ${keyAndIV.key}`, `iv: ${keyAndIV.iv}`].join('\n')
          );
          break;
        }
        case 'decrypt-service-account-credentials': {
          const key = TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_KEY;
          const iv = TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_IV;
          if (!key || !iv) {
            console.log(
              '> Environment insufficient to decrypt service account credentials'
            );
            break;
          }

          await decryptCredentials({key, iv}, `${projectID}-${keyID}.json`);
          break;
        }
        case 'get-plugin-types':
          await getPluginTypes();
          break;
        case 'init-test-fixtures':
          await initTestFixtures(!TRACE_TEST_EXCLUDE_INTEGRATION);
          break;
        case 'run-unit-tests':
          await runTests({
            includeGlobs: [
              `${BUILD_DIRECTORY}/test/test-*.js`,
              `${BUILD_DIRECTORY}/test/plugins/test-*.js`,
            ],
            excludeGlobs: unitTestExcludeGlobs,
            rootDir: BUILD_DIRECTORY,
            coverage: false,
            timeout: 4000,
          });
          break;
        case 'run-unit-tests-with-coverage':
          await runTests({
            includeGlobs: [
              `${BUILD_DIRECTORY}/test/test-*.js`,
              `${BUILD_DIRECTORY}/test/plugins/test-*.js`,
            ],
            excludeGlobs: unitTestExcludeGlobs,
            rootDir: BUILD_DIRECTORY,
            coverage: true,
            timeout: 4000,
          });
          break;
        case 'report-coverage':
          await reportCoverage();
          break;
        case 'test-non-interference':
          await testNonInterference();
          break;
        default:
          console.log(`> ${step}: not found`);
          break;
      }
    }
  }
}

run(steps).catch(err => {
  console.error(err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
