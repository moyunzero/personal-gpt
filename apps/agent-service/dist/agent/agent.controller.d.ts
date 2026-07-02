import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
export declare class AgentController {
    private readonly config;
    constructor(config: ConfigService);
    chat(req: Request, res: Response, body: unknown): Promise<void>;
}
