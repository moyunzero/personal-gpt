export type GraphPathDisplay = {
  nodes: string[];
  relationships: string[];
};

export function graphPathsToDisplay(
  paths: Array<{
    nodes: Array<{ labels: string[]; id: string; properties: Record<string, unknown> }>;
    relationships: Array<{ type: string }>;
  }>,
): GraphPathDisplay[] {
  return paths.map((path) => ({
    nodes: path.nodes.map((n) => {
      const label = n.labels[0] ?? "Node";
      const name =
        typeof n.properties.name === "string" && n.properties.name.trim()
          ? n.properties.name
          : n.id;
      return `${label}:${name}`;
    }),
    relationships: path.relationships.map((r) => r.type),
  }));
}
