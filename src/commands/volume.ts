import { SlashCommandBuilder } from "discord.js";

export const options = new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Установить громкость плеера.")
    .addIntegerOption((o) => o.setName("volume").setDescription("Новая громкость плеера.").setRequired(true).setMinValue(1).setMaxValue(200))
    .toJSON();
export const permission = 0;

import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import Util from "../util/Util";

export const run = async (interaction: ChatInputCommandInteraction) => {
    const member = interaction.member as GuildMember;
    const volume = interaction.options.getInteger("volume");

    if (!member.voice.channel)
        return await interaction.reply({
            content: "❌ Вы должны находится в голосовом канале.",
            ephemeral: true
        });
    if (
        interaction.guild.members.me.voice.channel &&
        member.voice.channel.id !== interaction.guild.members.me.voice.channel.id
    ) return await interaction.reply({
        content: "❌ Вы должны находится в том же голосовом канале, что и я.",
        ephemeral: true
    });

    const player = Util.lava.get(interaction.guildId);
    if (!player) {
        return await interaction.reply({
            content: "❌ На этом сервере ничего не играет.",
            ephemeral: true
        });
    };

    await interaction.reply(`Новая громкость - \`${volume}%\``).then(() => player.setVolume(volume));
    setTimeout(async () => await interaction.deleteReply().catch(() => { }), 30 * 1000);
};