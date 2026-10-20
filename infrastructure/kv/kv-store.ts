import { type Config, Effect, type FileSystem, Layer, type Path, type PlatformError } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { StoreConfig } from '@app-template/config'

export const KeyValueStoreFileSystem: Layer.Layer<
  KeyValueStore.KeyValueStore,
  Config.ConfigError | PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = Layer.unwrap(Effect.map(StoreConfig, ({ path }) => KeyValueStore.layerFileSystem(path))).pipe(
  Layer.provide(StoreConfig.layer),
)
