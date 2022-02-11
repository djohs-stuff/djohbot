const { SlashCommandBuilder } = require("@discordjs/builders");

module.exports = {
    options: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Удалить указанное количество сообщений в канале.")
        .addIntegerOption((o) => o.setName("amount").setDescription("Количество сообщений которое надо удалить.").setRequired(true).setMinValue(2).setMaxValue(100))
        .addUserOption((o) => o.setName("member").setDescription("Участник, чьи сообщения должны быть очищены."))
        .toJSON(),
    permission: 1
};

const cooldowns = new Set();
const { CommandInteraction } = require("discord.js");
const db = require("../database/")();

module.exports.run = async (interaction) => {
    if (!(interaction instanceof CommandInteraction)) return;

    if (cooldowns.has(interaction.channel.id))
        return interaction.reply({ content: "❌ Подождите несколько секунд перед повторным использованем команды.", ephemeral: true });
    else cooldowns.add(interaction.channel.id) && setTimeout(() => cooldowns.delete(interaction.channel.id), 4000);

    const guilddb = await db.guild(interaction.guild.id);

    if (!interaction.channel.permissionsFor(interaction.guild.me).has("MANAGE_MESSAGES"))
        return await interaction.reply({ content: "❌ У меня нет прав на управление сообщениями в этом канале.", ephemeral: true });

    const limit = interaction.options.getInteger("amount");

    let toDelete = await interaction.channel.messages.fetch({ limit: limit });
    if (!guilddb.get().purgePinned) toDelete = toDelete.filter((m) => !m.pinned);
    if (interaction.options.getUser("member")) toDelete = toDelete.filter((m) => m.author.id == interaction.options.getUser("member").id);
    if (!toDelete.size) return await interaction.reply({ content: "❌ Не удалось найти сообщений для удаления.", ephemeral: true });

    const purged = await interaction.channel.bulkDelete(toDelete, true);

    return await interaction.reply({
        content: (
            purged.size ?
                "✅ Удалено " + (
                    purged.size == 1 ?
                        purged.size + " сообщение" :
                        [2, 3, 4].includes(purged.size) ?
                            purged.size + " сообщения" :
                            purged.size + " сообщений"
                ) :
                "Произошла ошибка при подсчёте удалённых сообщений."
        ),
        ephemeral: true
    });
};
