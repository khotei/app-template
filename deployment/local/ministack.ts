import { fileURLToPath } from 'node:url'

import * as docker from '@pulumi/docker'
import { Effect, Option } from 'effect'

import { projectName } from '@app-template/aws'
import { AwsConfig, ministackImage } from '@app-template/config'

const internalPort = 4566
/**
 * The host port is the one in `AWS_ENDPOINT_URL`, and the container is named after it, so a
 * worktree's MiniStack runs beside the main tree's without sharing a port, a name or a state.
 */
const { region, endpoint } = Effect.runSync(Effect.provide(AwsConfig, AwsConfig.layer))
const endpointUrl = Option.getOrThrowWith(
  Option.filter(endpoint, (url) => url.port !== ''),
  () => new Error('AWS_ENDPOINT_URL must name MiniStack with a port, as http://localhost:4566'),
)
const port = Number(endpointUrl.port)
const dataDir = fileURLToPath(new URL('../../.data/ministack', import.meta.url))

const remoteImage = new docker.RemoteImage('ministack-image', {
  name: ministackImage,
  keepLocally: true,
})

new docker.Container(
  'ministack',
  {
    name: `${projectName}-ministack-${port}`,
    image: remoteImage.imageId,
    ports: [{ internal: internalPort, external: port }],
    envs: [
      `MINISTACK_REGION=${region}`,
      'PERSIST_STATE=1',
      'STATE_DIR=/data/state',
      'S3_PERSIST=1',
      'S3_DATA_DIR=/data/s3',
    ],
    volumes: [{ hostPath: dataDir, containerPath: '/data' }],
    healthcheck: {
      tests: [
        'CMD',
        'python',
        '-c',
        `import urllib.request; urllib.request.urlopen('http://localhost:${internalPort}/_ministack/health')`,
      ],
      interval: '2s',
      timeout: '3s',
      retries: 15,
      startPeriod: '2s',
    },
    wait: true,
    waitTimeout: 60,
    // A plain remove kills MiniStack mid-save; a stop lets it write its state first.
    destroyGraceSeconds: 15,
    stopTimeout: 15,
  },
  {
    // A new name or image replaces the container; the old one holds the port until it is deleted.
    deleteBeforeReplace: true,
  },
)
