module.exports = {
  parser: "typescript",
  trailingComma: "all",
  importOrder: ["^@core/(.*)$", "^[./]"],
  importOrderSeparation: true,
  experimentalBabelParserPluginsList: [
    "classPrivateProperties",
  ]
};
