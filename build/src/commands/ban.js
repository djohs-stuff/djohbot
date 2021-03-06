"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.permission = exports.options = void 0;
const discord_js_1 = require("discord.js");
exports.options = new discord_js_1.SlashCommandBuilder()
    .setName("ban")
    .setDescription("Забанить участника.")
    .addUserOption((o) => o.setName("member").setDescription("Пользователь, которого надо забанить.").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Время, на которое участник будет забанен."))
    .addStringOption((o) => o.setName("reason").setDescription("Причина выдачи бана."))
    .addIntegerOption((o) => o.setName("purgedays").setDescription("Удаление сообщений пользователя за указанное время, в днях.").setMaxValue(7).setMinValue(1))
    .toJSON();
exports.permission = 1;
const discord_js_2 = require("discord.js");
const constants_1 = require("../constants/");
const resolvers_1 = require("../constants/resolvers");
const pretty_ms_1 = __importDefault(require("pretty-ms"));
const Util_1 = __importDefault(require("../util/Util"));
const run = async (interaction) => {
    const member = interaction.options.getMember("member");
    if (!interaction.guild.members.me.permissions.has(discord_js_2.PermissionFlagsBits.BanMembers) ||
        !member.manageable)
        return await interaction.reply({ content: "❌ Я не могу забанить этого участника.", ephemeral: true });
    if (interaction.options.get("duration") &&
        !(0, resolvers_1.parseTime)(interaction.options.get("duration")))
        return await interaction.reply({ content: "❌ Не удалось обработать указанное время.", ephemeral: true });
    const bans = await interaction.guild.bans.fetch();
    const guilddb = await Util_1.default.database.guild(interaction.guild.id);
    if (bans.has(member.user.id))
        return await interaction.reply({ content: "❌ Этот пользователь уже забанен.", ephemeral: true });
    if ((0, constants_1.getPermissionLevel)(member) >= (0, constants_1.getPermissionLevel)(interaction.member))
        return await interaction.reply({ content: "❌ Вы не можете забанить этого человека.", ephemeral: true });
    await interaction.deferReply();
    let dmsent = false;
    let time = 0;
    let reason = interaction.options.getString("reason")?.trim();
    let purgedays = interaction.options.getInteger("purgedays");
    if (!interaction.options.getString("duration"))
        time = -1;
    else
        time = Date.now() + (0, resolvers_1.parseTime)(interaction.options.getString("duration"));
    const dmemb = new discord_js_2.EmbedBuilder()
        .setAuthor({
        name: interaction.guild.name,
        iconURL: interaction.guild.iconURL()
    })
        .setTitle("Вы были забанены")
        .addFields({
        name: "Модератор",
        value: `${interaction.user} (**${interaction.user.tag.replace(/\*/g, "\\*")}**)`,
        inline: true
    });
    if (time != -1)
        dmemb.addFields({
            name: "Время",
            value: `\`${(0, pretty_ms_1.default)((0, resolvers_1.parseTime)(interaction.options.getString("duration")))}\``,
            inline: true
        });
    if (reason)
        dmemb.addFields({
            name: "Причина",
            value: reason
        });
    await member.user.send({ embeds: [dmemb] }).then(() => dmsent = true).catch(() => null);
    await interaction.guild.bans.create(member.id, {
        reason: `${interaction.user.tag}: ${reason || "Не указана."}`,
        deleteMessageDays: purgedays
    }).then(async () => {
        guilddb.setOnObject("bans", member.user.id, time);
        await interaction.editReply({
            content: `✅ ${member} был успешно забанен.` +
                (dmsent ? "\n[__Пользователь был уведомлён в лс__]" : "")
        });
    }).catch(async () => {
        await interaction.editReply({ content: "❌ Произошла неизвестная ошибка." });
    });
};
exports.run = run;
