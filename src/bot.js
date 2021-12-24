require("nodejs-better-console").overrideConsole();
const Discord = require("discord.js");
const config = require("../config");
const commandHandler = require("./handlers/commands");
const interactionHandler = require("./handlers/interactions/");
const lavaHandler = require("./handlers/lava");
const countingHandler = require("./handlers/counting");
const prepareGuild = require("./handlers/prepareGuilds");
const tickers = require("./handlers/tickers");
const client = new Discord.Client({
    makeCache: Discord.Options.cacheWithLimits({
        GuildStickerManager: 0,
        GuildInviteManager: 0,
        GuildEmojiManager: 0,
        GuildBanManager: {
            sweepInterval: 30,
            sweepFilter: Discord.LimitedCollection.filterByLifetime({
                lifetime: 5
            })
        },
        MessageManager: {
            sweepInterval: 600,
            maxSize: 1024,
            keepOverLimit: (m) => m.author.id != m.client.user.id,
            sweepFilter: Discord.LimitedCollection.filterByLifetime({
                lifetime: 86400
            })
        }
    }),
    intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "GUILD_BANS", "GUILD_VOICE_STATES"],
    presence: {
        status: "dnd",
        activities: [{
            type: "WATCHING",
            name: "загрузочный экран",
        }]
    }
});
const db = require("./database/")();
const { deleteMessage } = require("./handlers/utils");
const { voicesJoin, voicesLeave, voicesSwitch } = require("./constants/callbacks");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const rest = new REST({ version: "9" }).setToken(config.token);
require("discord-logs")(client);

global.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
global.parse = require("./constants/resolvers").parseTime;
global.parseMs = require("pretty-ms");
module.exports.client = client;
global.client = client;
global.db = db;

let shard = "[Shard N/A]";
client.once("shardReady", async (shardId, unavailable = new Set()) => {
    let start = Date.now();
    client.shardId = shardId;
    shard = `[Shard ${shardId}]`;
    client.s = shard;

    interactionHandler(client);
    await require("./handlers/interactions/slash").registerCommands(client);
    console.log(`${shard} Refreshed slash commands.`);
    await lavaHandler(client);

    console.log(`${shard} Ready as ${client.user.tag}! Caching guilds.`);

    client.loading = true;

    let disabledGuilds = new Set([...Array.from(unavailable), ...client.guilds.cache.map((g) => g.id)]);
    let guildCachingStart = Date.now();

    await db.cacheGSets(disabledGuilds);
    await db.cacheGuilds(disabledGuilds);
    console.log(`${shard} All ${disabledGuilds.size} guilds have been cached. Processing available guilds. [${Date.now() - guildCachingStart}ms]`);

    let processingStartTimestamp = Date.now(), completed = 0, presenceInterval = setInterval(() => client.user.setPresence({
        status: "idle",
        activities: [{
            type: "WATCHING",
            name: `${Math.floor((completed / client.guilds.cache.size) * 100)}%`
        }]
    }), 1000);
    await Promise.all(client.guilds.cache.map(async (guild) => {
        if (!config.dev) await prepareGuild(guild, db);
        disabledGuilds.delete(guild.id);
        completed++;
    }));
    clearInterval(presenceInterval);
    console.log(`${shard} All ${client.guilds.cache.size} available guilds have been processed. [${Date.now() - processingStartTimestamp}ms]`);

    disabledGuilds = false;
    client.loading = false;
    await tickers(client);

    console.log(`${shard} Ready in ${((Date.now() - start) / 1000).toFixed(3)}s`);
});

const linkRate = new Set();
const linkCache = require("./constants/badlinks");
client.on("messageCreate", async (message) => {
    if (
        !message.guild ||
        message.webhookId ||
        message.author.bot
    ) return;

    const gdb = await db.guild(message.guild.id);
    const gsdb = await db.settings(message.guild.id);

    if (gdb.get().mutes[message.author.id] && gsdb.get().delMuted) return deleteMessage(message);

    if (gsdb.get().detectScamLinks && linkCache.filter((i) => i.length && message.content?.replaceAll(/ |[а-я]/gi, "").includes(i))?.length) {
        if (!linkRate.has(message.author.id)) await message.channel.send(
            `${message.author}, в вашем сообщении была замечена вредоносная ссылка. Сообщение ` +
            (message.deletable ? "будет удалено." : "не будет удалено, так как у меня нет прав на удаление сообщений в этом канале.")
        ).then((m) => setTimeout(() => deleteMessage(m), 10 * 1000));

        deleteMessage(message);

        if (!linkRate.has(message.author.id)) linkRate.add(message.author.id);
        setTimeout(() => linkRate.delete(message.author.id), 5000);
    };

    global.gdb = gdb;
    global.gsdb = gsdb;
    global.gldb = db.global;

    let { channel } = gdb.get();

    if (message.content.startsWith(config.prefix) || message.content.match(`^<@!?${client.user.id}> `)) return commandHandler(message, config.prefix, gdb, db);
    if (channel == message.channel.id) return countingHandler(message, gdb);
    if (message.content.match(`^<@!?${client.user.id}>`)) return message.react("👋").catch(() => null);
});

client.on("messageDelete", async (deleted) => {
    const gdb = await db.guild(deleted.guild.id);
    let { modules, channel, message, user, count } = gdb.get();
    if (
        channel == deleted.channel.id &&
        message == deleted.id &&
        !modules.includes("embed") &&
        !modules.includes("webhook")
    ) {
        let newMessage = await deleted.channel.send(`${deleted.author || `<@${user}>`}: ${deleted.content || count}`);
        gdb.set("message", newMessage.id);
    };
});
client.on("channelDelete", async (channel) => {
    if (!(channel instanceof Discord.VoiceChannel)) return;

    const player = client.manager.create({
        guild: channel.guildId
    });

    if (
        player.voiceChannel == channel.id &&
        (player.playing || player.queue.totalSize)
    ) {
        client.channels.cache.get(player.textChannel)?.send("Канал был удалён. Останавливаю плеер.");
        player.destroy();
    };
    if (!(player.playing || player.queue.totalSize)) player.destroy();
});

client.on("messageUpdate", async (original, updated) => {
    const gdb = await db.guild(updated.guild.id);
    const gsdb = await db.settings(updated.guild.id);
    if (gsdb.get().detectScamLinks && linkCache.filter((i) => i.length && updated.content?.replaceAll(/ |[а-я]/gi, "").includes(i))?.length) {
        if (!linkRate.has(updated.author.id)) await updated.channel.send(
            `${updated.author}, в вашем сообщении была замечена вредоносная ссылка. Сообщение ` +
            (updated.deletable ? "будет удалено." : "не будет удалено, так как у меня нет прав на удаление сообщений в этом канале.")
        ).then((m) => setTimeout(() => deleteMessage(m), 10 * 1000));

        deleteMessage(updated);

        if (!linkRate.has(updated.author.id)) linkRate.add(updated.author.id);
        setTimeout(() => linkRate.delete(updated.author.id), 5000);
    };

    let { modules, channel, message, count } = gdb.get();
    if (
        channel == updated.channel.id &&
        message == updated.id &&
        !modules.includes("embed") &&
        !modules.includes("webhook") &&
        (
            modules.includes("talking") ?
                (original.content || `${count}`).split(" ")[0] != updated.content.split(" ")[0] : // check if the count changed at all
                (original.content || `${count}`) != updated.content
        )
    ) {
        let newMessage = await updated.channel.send(`${updated.author}: ${original.content || count}`);
        gdb.set("message", newMessage.id);
        deleteMessage(original);
    };
});

client.on("guildCreate", async (guild) => {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: client.slashes }).catch((err) => {
        if (!err.message.toLowerCase().includes("missing")) console.error(err);
    });
    const members = await guild.members.fetch();
    const owner = await client.users.fetch(guild.ownerId);

    client.users.fetch("419892040726347776").then((u) => u.send({
        content: "<a:pepeD:904171928091234344> new guild <a:pepeD:904171928091234344>",
        embeds: [{
            title: `${guild.name} - ${guild.id}`,
            author: {
                name: `${owner.tag} - ${owner.id}`,
                iconURL: owner.avatarURL({ dynamic: true, format: "png" })
            },
            thumbnail: guild.iconURL({ dynamic: true, format: "png", size: 512 }),
            fields: [{
                name: "counts",
                value: [
                    `🤖 \`${members.filter((a) => a.user.bot).size}\``,
                    `🧑‍🤝‍🧑 \`${members.filter((a) => !a.user.bot).size}\``,
                    `🔵 \`${guild.memberCount}\``
                ].join("\n")
            }]
        }]
    }));
});

client.on("guildDelete", async (guild) => {
    const owner = await client.users.fetch(guild.ownerId);

    client.users.fetch("419892040726347776").then((u) => u.send({
        content: "<a:pepeD:904171928091234344> guild removed <a:pepeD:904171928091234344>",
        embeds: [{
            title: `${guild.name} - ${guild.id}`,
            author: {
                name: `${owner.tag} - ${owner.id}`,
                iconURL: owner.avatarURL({ dynamic: true, format: "png" })
            },
            thumbnail: guild.iconURL({ dynamic: true, format: "png", size: 512 }),
            fields: [{
                name: "count",
                value: `🔵 \`${guild.memberCount}\``
            }]
        }]
    }));
});

if (!config.dev) client.on("voiceChannelJoin", voicesJoin);
if (!config.dev) client.on("voiceChannelLeave", voicesLeave);
if (!config.dev) client.on("voiceChannelSwitch", voicesSwitch);
client.on("error", (err) => console.error(`${shard} Client error. ${err}`));
client.on("rateLimit", (rateLimitInfo) => console.warn(`${shard} Rate limited.\n${JSON.stringify(rateLimitInfo)}`));
client.on("shardDisconnected", () => console.warn(`${shard} Disconnected.`));
client.on("shardError", (err) => console.error(`${shard} Error. ${err}`));
client.on("shardReconnecting", () => console.log(`${shard} Reconnecting.`));
client.on("shardResume", (_, replayedEvents) => console.log(`${shard} Resumed. ${replayedEvents} replayed events.`));
client.on("warn", (info) => console.warn(`${shard} Warning. ${info}`));
client.login(config.token);

process.on("unhandledRejection", (rej) => console.error(rej));