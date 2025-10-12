require("dotenv").config();
const fs = require("fs");
const express = require("express");
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField 
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// -------------------- Config from .env --------------------
const TICKET_CATEGORY_ID = process.env.MASTER_TICKET_CATEGORY; // New tickets
const ARCHIVE_CATEGORY_ID = process.env.ARCHIVE_CATEGORY_ID; // Closed tickets
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID; // Staff role
const START_NUMBER = 4176;
const COUNTER_FILE = "./counter.json";

// -------------------- Counter --------------------
let counter = START_NUMBER;
if (fs.existsSync(COUNTER_FILE)) {
    const data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8"));
    counter = data.counter || START_NUMBER;
}

function saveCounter() {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ counter: counter }));
}

// -------------------- Express Keepalive --------------------
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000);

// -------------------- Ready --------------------
client.once("ready", () => {
    console.log(`${client.user.tag} is online!`);
});

// -------------------- Ticket Creation Command --------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "newticket") {
        counter++;
        saveCounter();

        const ticketName = `❌-unclaimed-ticket-${counter}`;
        const ticketChannel = await interaction.guild.channels.create({
            name: ticketName,
            type: 0,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: STAFF_ROLE_ID,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("✅ Claim Ticket")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("request_help")
                .setLabel("🆘 Request Help")
                .setStyle(ButtonStyle.Primary)
        );

        await ticketChannel.send({
            content: `Hello <@${interaction.user.id}>, a staff member will assist you shortly.`,
            components: [buttons]
        });

        await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
    }
});

// -------------------- Button Interactions --------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const ticketChannel = interaction.channel;
    const user = interaction.user;

    // -------------------- Staff-only check --------------------
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
        return interaction.reply({ content: "❌ Only staff can use these buttons.", ephemeral: true });
    }

    // -------------------- Claim Ticket --------------------
    if (interaction.customId === "claim_ticket") {
        if (!ticketChannel.name.startsWith("❌-unclaimed-ticket")) {
            return interaction.reply({ content: "❌ This ticket is already claimed by another staff!", ephemeral: true });
        }

        const newName = ticketChannel.name.replace("❌-unclaimed-ticket", "✅-claimed-ticket");
        await ticketChannel.setName(newName);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("❌ Close Ticket")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("request_help")
                .setLabel("🆘 Request Help")
                .setStyle(ButtonStyle.Primary)
        );

        await ticketChannel.send({
            content: `✅ Ticket claimed by Master <@${user.id}>`,
            components: [buttons]
        });

        // Notify ticket creator
        try {
            const ticketOwner = ticketChannel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== STAFF_ROLE_ID);
            if (ticketOwner) {
                const member = await interaction.guild.members.fetch(ticketOwner.id);
                await member.send(`💬 Your ticket has been claimed by <@${user.id}>.`);
            }
        } catch {}

        await interaction.deferUpdate();
    }

    // -------------------- Request Help --------------------
    if (interaction.customId === "request_help") {
        if (!ticketChannel.name.startsWith("✅-claimed-ticket")) {
            return interaction.reply({ content: "❌ This ticket is not currently claimed.", ephemeral: true });
        }

        const newName = ticketChannel.name.replace("✅-claimed-ticket", "❌-unclaimed-ticket");
        await ticketChannel.setName(newName);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("✅ Claim Ticket")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("❌ Close Ticket")
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
            content: `🆘 <@${user.id}> is requesting help because I can't handle this ticket. Ticket reopened for other @staff.`,
            components: [buttons]
        });

        try {
            const ticketOwner = ticketChannel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== STAFF_ROLE_ID);
            if (ticketOwner) {
                const member = await interaction.guild.members.fetch(ticketOwner.id);
                await member.send(`💬 The staff member <@${user.id}> has requested help. Another staff will assist you soon.`);
            }
        } catch {}

        await interaction.deferUpdate();
    }

    // -------------------- Close Ticket --------------------
    if (interaction.customId === "close_ticket") {
        const newName = `🔒-closed-${counter}`;
        await ticketChannel.setParent(ARCHIVE_CATEGORY_ID);
        await ticketChannel.setName(newName);

        await ticketChannel.send("🔒 Ticket closed and moved to archive.");

        try {
            const ticketOwner = ticketChannel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== STAFF_ROLE_ID);
            if (ticketOwner) {
                const member = await interaction.guild.members.fetch(ticketOwner.id);
                await member.send("💬 Your ticket has been closed. Thank you!");
            }
        } catch {}

        await interaction.deferUpdate();
    }
});

// -------------------- Register Slash Commands --------------------
client.on("ready", async () => {
    const data = [
        {
            name: "newticket",
            description: "Create a new support ticket",
        },
    ];
    await client.application.commands.set(data);
});

client.login(process.env.TOKEN);
