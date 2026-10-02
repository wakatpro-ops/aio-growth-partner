// The explicit ESM entry has the same API as the package entry. Using it keeps
// SheetJS utilities/SSF consistent in Node regression tests and Next bundles.
declare module "xlsx/xlsx.mjs" {
  export * from "xlsx";
}
