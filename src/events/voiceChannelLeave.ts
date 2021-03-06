import { GuildMember, VoiceBasedChannel } from "discord.js";
import Util from "../util/Util";

export async function run(member: GuildMember, channel: VoiceBasedChannel) {
    const gdb = await Util.database.guild(member.guild.id);

    if (gdb.get().voices[channel.id] === member.user.id) {
        await channel.delete().catch(() => null);
        gdb.removeFromObject("voices", channel.id);
    };
};