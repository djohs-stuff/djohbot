const { Client, Message } = require("discord.js");
const { deleteMessage } = require("../handlers/utils");
const db = require("../database/")();

module.exports = {
    name: "messageUpdate",

    run: async (client, original, updated) => {
        if (!(client instanceof Client)) return;
        if (!(original instanceof Message)) return;
        if (!(updated instanceof Message)) return;

        const gdb = await db.guild(updated.guild.id);

        const { modules, channel, message, count } = gdb.get();
        if (
            channel == updated.channel.id &&
            message == updated.id &&
            !modules.includes("embed") &&
            !modules.includes("webhook") &&
            (
                modules.includes("talking")
                    ? (original.content || `${count}`).split(" ")[0] != updated.content.split(" ")[0]
                    : (original.content || `${count}`) != updated.content
            )
        ) {
            const newMessage = await updated.channel.send(`${updated.author}: ${original.content || count}`);
            gdb.set("message", newMessage.id);
            deleteMessage(original);
        };
    }
};