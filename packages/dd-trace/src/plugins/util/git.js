const { exec } = require('child_process')
const { promisify } = require('util')
const promiseExec = promisify(exec)

const GIT_COMMIT_SHA = 'git.commit.sha'
const GIT_BRANCH = 'git.branch'
const GIT_REPOSITORY_URL = 'git.repository_url'

const sanitizedRun = async cmd => {
  try {
    return (await promiseExec(cmd)).stdout.replace(/(\r\n|\n|\r)/gm, '')
  } catch (e) {
    return ''
  }
}

module.exports = {
  default: async function () {
    return {
      [GIT_REPOSITORY_URL]: await sanitizedRun('git ls-remote --get-url'),
      [GIT_BRANCH]: await sanitizedRun('git branch --show-current'),
      [GIT_COMMIT_SHA]: await sanitizedRun('git rev-parse HEAD')
    }
  },
  GIT_COMMIT_SHA,
  GIT_BRANCH,
  GIT_REPOSITORY_URL
}
