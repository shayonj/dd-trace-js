const { promisify } = require('util')

const getGitMetadata = require('../../dd-trace/src/plugins/util/git')
const getCiMetadata = require('../../dd-trace/src/plugins/util/ci')
const {
  TEST_FRAMEWORK,
  TEST_TYPE,
  TEST_NAME,
  TEST_SUITE,
  TEST_STATUS
} = require('../../dd-trace/src/plugins/util/test')

const BUILD_SOURCE_ROOT = 'build.source_root'

const SPAN_TYPE = 'span.type'
const RESOURCE_NAME = 'resource.name'

function finishStartedSpans () {
  global.tracer
    .scope()
    .active()
    .context()._trace.started.forEach((span) => {
      span.finish()
    })
}

function setTestStatus (status) {
  global.tracer.scope().active().setTag(TEST_STATUS, status)
}

function getEnvironment (BaseEnvironment) {
  return class DatadogJestEnvironment extends BaseEnvironment {
    constructor (config, context) {
      super(config, context)
      this.testSuite = context.testPath.replace(`${config.rootDir}/`, '')
      this.rootDir = config.rootDir
    }
    async setup () {
      if (!global.tracer) {
        const ciMetadata = getCiMetadata()
        const gitMetadata = await getGitMetadata()
        global.tracer = require('../../dd-trace').init({
          sampleRate: 1,
          flushInterval: 1,
          startupLogs: false,
          ingestion: {
            sampleRate: 1
          },
          tags: {
            ...ciMetadata,
            ...gitMetadata,
            [BUILD_SOURCE_ROOT]: this.rootDir,
            [TEST_FRAMEWORK]: 'jest'
          }
        })
      }

      return super.setup()
    }
    async teardown () {
      await new Promise((resolve) => {
        global.tracer._tracer._exporter._writer.flush(resolve)
      })
      return super.teardown()
    }

    async handleTestEvent (event) {
      if (event.name === 'test_skip' || event.name === 'test_todo') {
        global.tracer.startSpan(
          'jest.test',
          {
            tags: {
              // Since we are using `startSpan` we can't use `type` and `resource` options
              // so we have to manually set the tags.
              [SPAN_TYPE]: 'test',
              [RESOURCE_NAME]: `${event.test.parent.name}.${event.test.name}`,
              [TEST_TYPE]: 'test',
              [TEST_NAME]: event.test.name,
              [TEST_SUITE]: this.testSuite,
              [TEST_STATUS]: 'skip'
            }
          }
        ).finish()
      }
      if (event.name === 'test_start') {
        let specFunction = event.test.fn
        if (specFunction.length) {
          specFunction = promisify(specFunction)
        }
        event.test.fn = global.tracer.wrap(
          'jest.test',
          { type: 'test',
            resource: `${event.test.parent.name}.${event.test.name}`,
            tags: {
              [TEST_TYPE]: 'test',
              [TEST_NAME]: event.test.name,
              [TEST_SUITE]: this.testSuite
            } },
          async () => {
            let result
            try {
              result = await specFunction()
              setTestStatus('pass')
            } catch (error) {
              setTestStatus('fail')
              throw error
            } finally {
              finishStartedSpans()
            }
            return result
          }
        )
      }
    }
  }
}

module.exports = {
  name: 'jest',
  // ** Important: This needs to be the same as the versions for datadog-plugin-jest-circus
  versions: ['>=24.8.0'],
  getEnvironment
}
