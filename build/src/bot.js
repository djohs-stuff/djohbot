"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shard = exports.client = void 0;
require("nodejs-better-console").overrideConsole();
const fs_1 = __importDefault(require("fs"));
const database_1 = __importDefault(require("./database/"));
const util_1 = require("util");
const Util_1 = __importDefault(require("./util/Util"));
const discord_js_1 = __importStar(require("discord.js"));
const pretty_ms_1 = __importDefault(require("pretty-ms"));
const tickers_1 = __importDefault(require("./handlers/tickers"));
const lava_1 = __importDefault(require("./handlers/lava"));
const types_1 = require("./constants/types");
const prepareGuilds_1 = __importDefault(require("./handlers/prepareGuilds"));
const slash_1 = require("./handlers/interactions/slash");
exports.client = new types_1.ModifiedClient({
    makeCache: discord_js_1.default.Options.cacheWithLimits({
        MessageManager: 4096
    }),
    sweepers: {
        messages: {
            interval: 600,
            lifetime: 24 * 60 * 60
        }
    },
    intents: [
        discord_js_1.IntentsBitField.Flags.Guilds,
        discord_js_1.IntentsBitField.Flags.GuildMessages,
        discord_js_1.IntentsBitField.Flags.GuildMembers,
        discord_js_1.IntentsBitField.Flags.GuildBans,
        discord_js_1.IntentsBitField.Flags.GuildVoiceStates
    ],
    partials: [discord_js_1.Partials.Channel],
    presence: {
        status: "dnd",
        activities: [{
                type: discord_js_1.ActivityType.Watching,
                name: "the loading screen",
            }]
    }
});
exports.client.cfg = {
    enslash: true,
    enbr: true,
    debug: false
};
Util_1.default.setClient(exports.client).setDatabase(database_1.default);
exports.shard = "[Shard N/A]";
exports.client.once("shardReady", async (shardId, unavailable = new Set()) => {
    let start = Date.now();
    exports.shard = `[Shard ${shardId}]`;
    exports.client.loading = true;
    let slashPostStart = Date.now();
    (0, slash_1.registerCommands)(exports.client).then((a) => {
        console.log(`${exports.shard} Refreshed slash commands for ${a.length}/${exports.client.guilds.cache.size} guilds. [${(0, pretty_ms_1.default)(Date.now() - slashPostStart)}]`);
    });
    console.log(`${exports.shard} Ready as ${exports.client.user?.tag}! Caching guilds.`);
    let disabledGuilds = new Set([...Array.from(unavailable), ...exports.client.guilds.cache.map((g) => g.id)]);
    let guildCachingStart = Date.now();
    await database_1.default.cacheGSets(disabledGuilds);
    await database_1.default.cacheGuilds(disabledGuilds);
    await (await database_1.default.global()).reload();
    console.log(`${exports.shard} All ${disabledGuilds.size} guilds have been cached. Processing available guilds. [${Date.now() - guildCachingStart}ms]`);
    let processingStartTimestamp = Date.now(), completed = 0, presenceInterval = setInterval(() => exports.client.user?.setPresence({
        status: "dnd",
        activities: [{
                type: discord_js_1.ActivityType.Watching,
                name: `${Math.floor((completed / exports.client.guilds.cache.size) * 100)}%`
            }]
    }), 1000);
    await Promise.all(exports.client.guilds.cache.map(async (guild) => {
        await (0, prepareGuilds_1.default)(guild);
        disabledGuilds.delete(guild.id);
        completed++;
    }));
    disabledGuilds = undefined;
    clearInterval(presenceInterval);
    console.log(`${exports.shard} All ${exports.client.guilds.cache.size} available guilds have been processed. [${Date.now() - processingStartTimestamp}ms]`);
    Util_1.default.setLavaManager((0, lava_1.default)(exports.client));
    (0, tickers_1.default)();
    exports.client.loading = false;
    console.log(`${exports.shard} Ready in ${(0, pretty_ms_1.default)(Date.now() - start)}`);
});
const eventFiles = fs_1.default.readdirSync(__dirname + "/events/").filter((x) => x.endsWith(".js"));
for (const filename of eventFiles) {
    const file = require(`./events/${filename}`);
    const name = filename.split(".")[0];
    if (file.once) {
        exports.client.once(name, file.run);
    }
    else {
        exports.client.on(name, file.run);
    }
    ;
}
;
exports.client.on("error", (err) => console.error(exports.shard, `Client error. ${(0, util_1.inspect)(err)}`));
exports.client.on("rateLimit", (rateLimitInfo) => console.warn(exports.shard, `Rate limited.\n${JSON.stringify(rateLimitInfo)}`));
exports.client.on("shardDisconnected", ({ code, reason }) => console.warn(exports.shard, `Disconnected. (${code} - ${reason})`));
exports.client.on("warn", (info) => console.warn(exports.shard, `Warning. ${info}`));
exports.client.on("debug", (info) => {
    if (exports.client.cfg.debug)
        console.debug(exports.shard, info);
});
database_1.default.connection.then(() => exports.client.login()).catch((e) => console.error(exports.shard, e));
process.on("unhandledRejection", (e) => console.error(exports.shard, "unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error(exports.shard, "uncaughtException:", e));
