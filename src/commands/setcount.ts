import { SlashCommandBuilder } from "discord.js";

export const options = new SlashCommandBuilder()
    .setName("setcount")
    .setDescription("Сменить текущий счёт.")
    .addIntegerOption((o) => o.setName("count").setDescription("Новый счёт.").setRequired(true).setMinValue(0))
    .toJSON();
export const permission = 1;

import { ChatInputCommandInteraction } from "discord.js";
import Util from "../util/Util";

export const run = async (interaction: ChatInputCommandInteraction) => {
    const gdb = await Util.database.guild(interaction.guild.id);
    const count = interaction.options.getInteger("count");

    gdb.set("count", count);

    await interaction.reply({ content: `✅ Новый текущий счёт - **\`${count}\`**.` });
};