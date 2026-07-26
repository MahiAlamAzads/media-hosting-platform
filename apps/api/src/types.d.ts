declare namespace Express {
  export interface Request {
    id: string;
    auth?: {
      principalType: "USER" | "API_KEY";
      userId: string;
      workspaceId: string;
      sessionId?: string;
      apiKeyId?: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      scopes: string[];
    };
  }
}
