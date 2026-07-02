"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:stream/promises");
function webStreamToNode(stream) {
    const reader = stream.getReader();
    return new node_stream_1.Readable({
        async read() {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    this.push(null);
                    return;
                }
                this.push(Buffer.from(value));
            }
            catch (error) {
                this.destroy(error instanceof Error ? error : new Error(String(error)));
            }
        },
    });
}
let AgentController = class AgentController {
    constructor(config) {
        this.config = config;
    }
    async chat(req, res, body) {
        const webUrl = this.config.get("WEB_URL") ?? "http://localhost:3000";
        const upstreamUrl = `${webUrl.replace(/\/$/, "")}/api/chat`;
        const upstream = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Origin: "http://localhost:3000",
            },
            body: JSON.stringify(body),
        });
        res.status(upstream.status);
        const contentType = upstream.headers.get("content-type") ?? "text/event-stream";
        res.setHeader("Content-Type", contentType);
        const cacheControl = upstream.headers.get("cache-control");
        if (cacheControl) {
            res.setHeader("Cache-Control", cacheControl);
        }
        if (!upstream.body) {
            if (!upstream.ok) {
                const text = await upstream.text();
                res.send(text);
                return;
            }
            throw new common_1.ServiceUnavailableException("Upstream returned empty body");
        }
        await (0, promises_1.pipeline)(webStreamToNode(upstream.body), res);
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, common_1.Post)("chat"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "chat", null);
exports.AgentController = AgentController = __decorate([
    (0, common_1.Controller)("agent"),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AgentController);
//# sourceMappingURL=agent.controller.js.map