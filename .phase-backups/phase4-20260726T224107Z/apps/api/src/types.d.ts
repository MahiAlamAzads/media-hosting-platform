declare namespace Express {
  export interface Request {
    id: string;
    auth?: {
      userId: string;
      workspaceId: string;
      sessionId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
    };
  }
}
