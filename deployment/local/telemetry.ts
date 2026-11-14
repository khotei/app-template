import * as docker from '@pulumi/docker'

import { projectName } from '@app-template/kernel/aws'

import { settings } from '#deployment/local/settings'

const telemetryImage =
  'grafana/otel-lgtm:0.40.0@sha256:72e05804790e6e0d8c0b70a6d5ff1f721ef7b203463374631e99aa3429bd0cf6'
const grafanaInternalPort = 3000
const otlpInternalPort = 4318
/**
 * The host ports are `GRAFANA_PORT` and the one in `OTEL_EXPORTER_OTLP_ENDPOINT`, and the container
 * is named after the latter, so a worktree's backend runs beside the main tree's. The Makefile
 * rebuilds the name (`NAME_TELEMETRY`); change both together.
 */
const { otlpEndpoint, grafanaPort } = settings.telemetry
const otlpPort = Number(otlpEndpoint.port)

const remoteImage = new docker.RemoteImage('telemetry-image', {
  name: telemetryImage,
  keepLocally: true,
})

export const telemetry = new docker.Container(
  'telemetry',
  {
    name: `${projectName}-telemetry-${otlpPort}`,
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
