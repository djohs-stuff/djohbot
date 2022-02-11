const { SlashCommandBuilder } = require("@discordjs/builders");

module.exports = {
    options: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Слушать музыку.")
        .addStringOption((o) => o.setName("query").setDescription("Трек, который вы хотите послушать.").setRequired(true))
        .toJSON(),
    permission: 0
};

const { CommandInteraction } = require("discord.js");
const db = require("../database/")();

module.exports.run = async (interaction) => {
    if (!(interaction instanceof CommandInteraction)) return;
    const client = interaction.client;
    const gdb = await db.guild(interaction.guild.id);
    if (gdb.get().channel == interaction.channelId) return interaction.reply({ content: "❌ Эта команда недоступна в данном канале.", ephemeral: true });

    if (!interaction.member.voice.channel) return interaction.reply({ content: "❌ Вы должны находится в голосовом канале.", ephemeral: true });
    if (
        interaction.guild.me.voice.channel &&
        interaction.member.voice.channel.id != interaction.guild.me.voice.channel.id
    ) return interaction.reply({ content: "❌ Вы должны находится в том же голосовом канале, что и я.", ephemeral: true });
    await interaction.deferReply();

    const res = await client.manager.search(interaction.options.getString("query"), interaction.user);
    if (!res?.tracks[0]) return interaction.editReply("❌ По вашему запросу не удалось ничего найти.");

    const player = client.manager.create({
        guild: interaction.guildId,
        voiceChannel: interaction.member.voice.channelId,
        textChannel: interaction.channelId,
        selfDeafen: true
    });

    if (player.state != "CONNECTED") player.connect();
    if ((player.queue.totalSize + (res.tracks[0].length || 1)) > 25) return await interaction.editReply("❌ Размер очереди не может превышать 25 треков.");
    else player.queue.add(res.tracks[0]);
    await interaction.editReply(`Трек добавлен в очередь:\n\`${res.tracks[0].title}\``);

    if (
        !player.playing &&
        !player.paused &&
        (
            !player.queue.size ||
            (
                player.queue.totalSize == res.tracks.length
            )
        )
    ) player.play();
};