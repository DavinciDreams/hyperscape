export {
  SaveDataMigrator,
  SaveDataRegistry,
  UnknownSaveSliceError,
  UnknownMigratorError,
  NoMigrationPathError,
  FutureSaveVersionError,
  applyFieldDefaults,
  collectMissingFields,
  type MigratorFn,
  type SaveRow,
} from "./SaveDataMigrator.js";
