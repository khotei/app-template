import * as docker from '@pulumi/docker'

import { buildResourceName } from '@app-template/kernel/aws'
import { telemetryImage } from '@app-template/kernel/config'

import { settings } from '#deployment/local/settings'

const grafanaInternalPort = 3000
const otlpInternalPort = 4318
const { otlpEndpoint, grafanaPort } = settings.telemetry
const otlpPort = Number(otlpEndpoint.port)

const remoteImage = new docker.RemoteImage('telemetry-image', {
  name: telemetryImage,
  keepLocally: true,
})

export const telemetry = new docker.Container(
  'telemetry',
  {
    name: buildResourceName(settings.aws.stage, 'telemetry'),
    image: remoteImage.imageId,
    ports: [
      { internal: grafanaInternalPort, external: grafanaPort },
      { internal: otlpInternalPort, external: otlpPort },
    ],
    // The image's own healthcheck, every 30 s, so a new container holds `make up` for about that.
    wait: true,
    waitTimeout: 120,
  },
  // A new name or image replaces the container; the old one holds the ports until it is deleted.
  { deleteBeforeReplace: true },
)
