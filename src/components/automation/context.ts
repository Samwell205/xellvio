import { createContext, useContext } from "react";

export type BuilderActions = {
  openConfig: (id: string) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  toggleDisabled: (id: string) => void;
  insertOnEdge: (edgeId: string) => void;
  testNode: (id: string) => void;
};

export const BuilderContext = createContext<BuilderActions | null>(null);

export function useBuilder(): BuilderActions {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("BuilderContext missing");
  return ctx;
}
