const { promisify } = require('util')

const getGitTags = require('../../dd-trace/src/plugins/util/git')
const {
  TEST_FRAMEWORK,
  TEST_TYPE,
  TEST_NAME,
  TEST_SUITE,
  TEST_STATUS
} = require('../../dd-trace/src/plugins/util/test')

const SPAN_TYPE = 'span.type'
const RESOURCE_NAME = 'resource.name'

async function mochaGlobalSetup () {
  const gitTags = await getGitTags()
  const tracer = require('dd-trace').init({
    sampleRate: 1,
    flushInterval: 1,
    ingestion: {
      sampleRate: 1
    },
    tags: {
      [TEST_FRAMEWORK]: 'jest',
      ...gitTags
    }
  })

  this.suite.suites.forEach((suite) => {
    suite.tests.forEach((test) => {
      const { pending: isSkipped, file: testSuite, title: testName } = test
      if (isSkipped) {
        tracer
          .startSpan('mocha.test', {
            tags: {
              [SPAN_TYPE]: 'test',
              [RESOURCE_NAME]: test.fullTitle(),
              [TEST_TYPE]: 'test',
              [TEST_NAME]: testName,
              [TEST_SUITE]: testSuite,
              [TEST_STATUS]: 'skip'
            }
          })
          .finish()
        return
      }
      let specFunction = test.fn

      if (specFunction.length) {
        specFunction = promisify(specFunction)
        // otherwise you have to explicitly call done()
        test.async = 0
        test.sync = true
      }

      test.fn = tracer.wrap(
        'mocha.test',
        {
          type: 'test',
          resource: test.fullTitle(),
          tags: {
            [TEST_TYPE]: 'test',
            [TEST_NAME]: testName,
            [TEST_SUITE]: testSuite
          }
        },
        async () => {
          let result
          try {
            result = await specFunction()
            tracer.scope().active().setTag(TEST_STATUS, 'pass')
          } catch (error) {
            tracer.scope().active().setTag(TEST_STATUS, 'fail')
            throw error
          } finally {
            tracer
              .scope()
              .active()
              .context()
              ._trace.started.forEach((span) => {
                span.finish()
              })
          }
          return result
        }
      )
    })
  })
}

module.exports = {
  name: 'mocha',
  // ** Important: This needs to be the same as the versions for datadog-plugin-jest-circus
  versions: ['8.2.1'],
  mochaGlobalSetup
}
