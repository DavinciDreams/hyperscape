import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";

export const fixtureCatalog: StaticCatalogDocument = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.demo.alpha",
      name: "Alpha",
      description: "First demo widget",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [
        {
          name: "label",
          type: "string",
          optional: true,
          description: "Label text",
        },
      ],
      defaultProps: { label: "" },
      jsdocSummary: "Alpha widget — does alpha things.",
      sourcePath: "packages/test/src/widgets/AlphaWidget.tsx",
    },
    {
      id: "com.test.demo.beta",
      name: "Beta",
      description: "Second demo widget",
      category: "hud",
      defaultSize: { width: 2, height: 2 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: { total: 2, byCategory: { panel: 1, hud: 1 } },
};
