import { createContext, useContext } from "react";

export type BuilderActions = {
  openConfig: (id: string) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  toggleDisabled: (id: string) => void;
  insertOnEdge: (edgeId: string) => void;
  testNode: (id: string) => void;
  /** Click-to-connect: start a link from a step's branch. */
  beginConnect: (nodeId: string, handleId: string) => void;
  /** Click-to-connect: finish the link on this step. */
  completeConnect: (nodeId: string) => void;
  cancelConnect: () => void;
  connectSource: { nodeId: string; handleId: string } | null;
  /** Whether the pending link may end on this step. */
  canAcceptConnect: (nodeId: string) => boolean;
  /** Which of this step's branches already lead somewhere. */
  connectedHandles: (nodeId: string) => Set<string>;
  /** Add the next step straight after a branch. */
  addAfter: (nodeId: string, handleId: string) => void;
};

export const BuilderContext = createContext<BuilderActions | null>(null);

export function useBuilder(): BuilderActions {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("BuilderContext missing");
  return ctx;
}
