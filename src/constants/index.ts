import { GuildMember, PermissionFlagsBits } from "discord.js";
import config from "../../config";

export const getPermissionLevel = (member: GuildMember): 5 | 4 | 3 | 2 | 1 | 0 => {
    if (config.admins[0] == member.user.id) return 5; // bot owner
    if (config.admins.includes(member.user.id)) return 4; // bot admin
    if (member.guild.ownerId == member.user.id) return 3; // server owner
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return 2; // server admin
    return 0; // server member
};

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const generateID = (): string => {
    let id: string;

    while (!id) {
        id = "";
        for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
    };
    return id;
};

const medals = {
    "1ะน": "๐ฅ", "2ะน": "๐ฅ", "3ะน": "๐ฅ"
};
const formatNumberSuffix = (n: number): string => {
    let str = `${n}`;
    if (str == "0") return "N/A";
    return str + "ะน";
};

export const formatScore = (id: string, index: number, users: object, userid?: string): string => {
    let suffix = formatNumberSuffix(index + 1);
    suffix = medals[suffix] || `**${suffix}**:`;
    if (userid === id) return `${suffix} *__<@${id}>, **ัััั:** ${(users[id] || 0)}__*`;
    else return `${suffix} <@${id}>, **ัััั:** ${(users[id] || 0)}`;
};