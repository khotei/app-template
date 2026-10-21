import { fileURLToPath } from 'node:url'

import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

/** The image `packages/testing/ministack.ts` starts for the tests; bump both together. */
const image =
  'ministackorg/ministack:1.5.29@sha256:88f507c57e16f5cac3c58dbdd4d47cfd14d6f870c38461aff7e077908253260b'
const port = 4566
const region = new pulumi.Config().get('region') ?? 'us-east-1'
const dataDir = fileURLToPath(new URL('../../.data/ministack', import.meta.url))

const remoteImage = new docker.RemoteImage('ministack-image', { name: image, keepLocally: true })

export const ministack = new docker.Container('ministack', {
  name: 'app-template-ministack',
  image: remoteImage.imageId,
  ports: [{ internal: port, external: port }],
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
      `import urllib.request; urllib.request.urlopen('http://localhost:${port}/_ministack/health')`,
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
})

export const endpoint = `http://localhost:${port}`
