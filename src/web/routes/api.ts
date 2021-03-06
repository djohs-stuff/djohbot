import { FastifyInstance, HookHandlerDoneFunction } from "fastify";
import config from "../../../config";
import discordoauth2 from "discord-oauth2";
import { manager } from "../../sharding";
import { ModifiedClient, SessionUser, CustomGuild, BcBotBumpAction, BcBotCommentAction } from "../../constants/types";
import { PermissionFlagsBits, PermissionsBitField, ShardClientUtil, WebhookClient } from "discord.js";
import axios from "axios";
const wh = new WebhookClient({ url: config.notifications_webhook });
const oauth2 = new discordoauth2({
    clientId: config.client.id,
    clientSecret: config.client.secret,
    redirectUri: config.redirectUri
});

export = (fastify: FastifyInstance, _: any, done: HookHandlerDoneFunction) => {
    fastify.get("/shards", async (_, res) => {
        const newBotInfo = await manager.broadcastEval((bot) => ({
            status: bot.ws.status,
            guilds: bot.guilds.cache.size,
            cachedUsers: bot.users.cache.size,
            channels: bot.channels.cache.size,
            users: bot.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
            ping: bot.ws.ping,
            loading: (bot as ModifiedClient).loading
        })).then((results) => results.reduce((info, next, index) => {
            for (const [key, value] of Object.entries(next)) {
                if (["guilds", "cachedUsers", "channels", "users"].includes(key)) info[key] = (info[key] || 0) + value;
            };
            info.shards[index] = next;
            return info;
        }, {
            shards: {} as {
                status: string,
                guilds: number,
                cachedUsers: number,
                channels: number,
                users: number,
                ping: number,
                loading: boolean
            },
            guilds: 0,
            cachedUsers: 0,
            channels: 0,
            users: 0,
            lastUpdate: 0
        }));
        newBotInfo.lastUpdate = Date.now();
        res.send(newBotInfo);
    });
    fastify.get("/metrics", async (req, res) => {
        const sharddata = (await axios("http://localhost:4000/api/shards").then((response) => response.data)) as {
            shards: {
                [key: string]: {
                    status: string,
                    guilds: number,
                    cachedUsers: number,
                    channels: number,
                    users: number,
                    ping: number,
                    loading: boolean
                }
            },
            guilds: number,
            cachedUsers: number,
            channels: number,
            users: number,
            lastUpdate: number
        };

        const metricObject = {
            total_guilds: sharddata.guilds,
            total_channels: sharddata.channels,
            total_users: sharddata.users,
            total_cached_users: sharddata.cachedUsers,
            average_ping: Object.values(sharddata.shards).reduce((total, next) => total + next.ping, 0) / Object.keys(sharddata.shards).length,

            shard_guilds: {},
            shard_channels: {},
            shard_users: {},
            shard_cached_users: {},
            shard_ping: {},
        } as { [key: string]: number | { [key: string]: number } };

        for (const [key, value] of Object.entries(sharddata.shards)) {
            metricObject["shard_guilds"][key] = value.guilds;
            metricObject["shard_channels"][key] = value.channels;
            metricObject["shard_users"][key] = value.users;
            metricObject["shard_cached_users"][key] = value.cachedUsers;
            metricObject["shard_ping"][key] = value.ping;
        };

        res.type("text/plain");
        res.send(prometheusMetrics(metricObject));
    });
    fastify.get("/login", (_, res) => {
        res.redirect(oauth2.generateAuthUrl({
            scope: ["identify", "guilds"],
            responseType: "code",
        }));
    });
    fastify.get("/logout", (req: any, res) => {
        req.session.user = null;
        res.redirect(req.session.lastPage);
    });
    fastify.get("/authorize", async (req: any, res) => {
        const a = await oauth2.tokenRequest({
            code: req.query.code,
            scope: ["identify", "guilds"],
            grantType: "authorization_code"
        }).catch(() => res.redirect(req.session.lastPage));

        if (!a.access_token) return res.redirect("/api/login");

        const user = await oauth2.getUser(a.access_token);
        req.session.user = user;
        req.session.user.guilds = await oauth2.getUserGuilds(a.access_token);
        res.redirect(req.session.lastPage);
    });
    fastify.get("/user/guilds", (req: any, res): any => {
        const user = req.session.user as SessionUser | null;
        if (!user) return res.redirect("/api/login");

        const guilds: CustomGuild[] = [];

        user.guilds.map((rawguild) => {
            guilds.push({
                id: rawguild.id,
                name: rawguild.name,
                iconUrl: rawguild.icon ? `https://cdn.discordapp.com/icons/${rawguild.id}/${rawguild.icon}.png` : null,
                managed: new PermissionsBitField().add(rawguild.permissions as any).has(PermissionFlagsBits.Administrator)
            });
        });

        res.send(guilds);
    });
    fastify.get("/bot/isinuguild/:guild", async (req: any, res) => {
        const { guild } = req.params as { guild: string };
        if (!guild) return res.send({ isinuguild: false });
        const isinuguild = await manager.broadcastEval((bot: ModifiedClient, guild: string) => !!bot.guilds.cache.get(guild), {
            shard: ShardClientUtil.shardIdForGuildId(guild, manager.shards.size),
            context: guild
        });
        res.send({ isinuguild });
    });
    fastify.get("/invite/:guildid", (req: any, res) => {
        const guildid = req.params.guildid;
        const botid = config.client.id;
        guildid ? res.redirect([
            "https://discord.com/oauth2/authorize",
            `?client_id=${botid}`,
            `&guild_id=${guildid}`,
            "&scope=bot%20applications.commands",
            "&permissions=1375450033182"
        ].join("")) : res.redirect([
            "https://discord.com/oauth2/authorize",
            `?client_id=${botid}`,
            "&scope=bot%20applications.commands",
            "&permissions=1375450033182"
        ].join(""));
    });
    fastify.post("/webhook/boticord", async (req, res) => {
        if (req.headers["x-hook-key"] !== config.monitoring.bc_hook_key) return res.status(403).send();
        const options = req.body as BcBotBumpAction | BcBotCommentAction;

        switch (options.type) {
            case "new_bot_bump":
                manager.broadcastEval((bot: ModifiedClient, options: BcBotBumpAction) => {
                    bot.util.func.processBotBump(options);
                }, {
                    shard: ShardClientUtil.shardIdForGuildId("888870095659630664", manager.shards.size),
                    context: options
                });
                break;
            case "new_bot_comment":
                await wh.send({
                    embeds: [{
                        title: "?????????? ??????????????????????",
                        description: [
                            `<@${options.data.user}>:`,
                            (options as BcBotCommentAction).data.comment.new
                        ].join("\n"),
                        fields: [{
                            name: "????????????",
                            value: !(options as BcBotCommentAction).data.comment.vote.new
                                ? "??????????????????????" : (options as BcBotCommentAction).data.comment.vote.new === 1
                                    ? "????????????????????" : "????????????????????"
                        }]
                    }],
                    username: "????????????????"
                });
                break;
            case "edit_bot_comment":
                let vote: string;
                if ((options as BcBotCommentAction).data.comment.vote.new == 1) vote = "????????????????????";
                else if ((options as BcBotCommentAction).data.comment.vote.new == -1) vote = "????????????????????";
                else vote = "??????????????????????";
                await wh.send({
                    embeds: [{
                        title: "?????????????????????? ??????????????",
                        description: [
                            `<@${options.data.user}>:`,
                            (options as BcBotCommentAction).data.comment.new
                        ].join("\n"),
                        fields: [{
                            name: "????????????",
                            value: vote
                        }]
                    }],
                    username: "????????????????"
                });
                break;
        };
        return res.status(202).send();
    });
    done();
};

const isdev = !config.monitoring.bc;
function prometheusMetrics(obj: { [key: string]: number | { [key: string]: number } }): string {
    const metrics = [];
    for (let [key, value] of Object.entries(obj)) {
        if (isdev) key = `d${key}`;
        const prefix = [
            `# HELP ${key} todo`,
            `# TYPE ${key} gauge`
        ].join("\n");

        metrics.push(prefix);

        if (typeof value === "number") {
            metrics.push(`${key} ${value}`);
        } else {
            for (const subkey in value) {
                metrics.push(`${key}{subkey="${subkey}",} ${value[subkey]}`);
            };
        };
    };
    return metrics.join("\n");
};