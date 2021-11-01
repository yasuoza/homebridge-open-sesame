module.exports = {
  parser: "typescript",
  trailingComma: "all",
  importOrder: ["^@core/(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderParserPlugins: [
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "typescript",
  ]
};
