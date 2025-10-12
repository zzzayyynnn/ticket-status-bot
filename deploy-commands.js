require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// -----------------------------
// Lightweight web server for ping (for uptime monitors)
// -----------------------------
const app = express();
app.get("/", (req, res) => res.send("ok"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ping endpoint running on port ${PORT}`));

// -----------------------------
// Discord client setup
// -----------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const COUNTER_PATH = path.join(__dirname, "counter.json");

// Safe load counter
let ticketCounter = 3480;
if (fs.existsSync(COUNTER_PATH)) {
  try {
    const raw = fs.readFileSync(COUNTER_PATH, "utf8");
    const parsed = JSON.parse(raw);
    ticketCounter = parsed.lastTicket || ticketCounter;
  } catch (err) {
    console.warn("Could not read counter.json, using default:", err.message);
  }
}

function saveCounter() {
  try {
    fs.writeFileSync(COUNTER_PATH, JSON.stringify({ lastTicket: ticketCounter }, null, 2));
  } catch (err) {
    console.error("Failed to save counter.json:", err.message);
  }
}

// -----------------------------
// Configuration
// -----------------------------
const STAFF_ROLE_ID = "1421545043214340166"; // staff role ID
const ARCHIVE_CATEGORY_ID = "1426986618618646688"; // archive category

// -----------------------------
// Helper: Send DM safely
// -----------------------------
async function safeDM(user, message) {
  try {
    await user.send(message);
  } catch {
    console.log(`Could not DM ${user.tag}`);
  }
}

// -----------------------------
// Discord events
// -----------------------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// -----------------------------
// Handle ticket creation
// -----------------------------
client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel?.guild || !channel.name.startsWith("ticket-")) return;

    const botMember = channel.guild.members.me;
    if (!botMember.permissionsIn(channel).has(PermissionsBitField.Flags.SendMessages)) return;

    const newName = `❌-unclaimed-ticket-${ticketCounter}`;
    await channel.setName(newName);
    ticketCounter++;
    saveCounter();

    // Buttons: Claim + Request Help
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim Ticket").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle("🎟️ New Ticket Created")
      .setDescription("Please wait for a staff member to claim and assist you.")
      .setColor("Yellow");

    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("ChannelCreate error:", err);
  }
});

// -----------------------------
// Handle button interactions
// -----------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user, channel, guild } = interaction;

  const member = await guild.members.fetch(user.id);
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Only staff can use these buttons.", ephemeral: true });
  }

  if (customId === "claim_ticket") {
    try {
      const newName = channel.name.replace(/^.*ticket-/, "✅-claimed-ticket-");
      await channel.setName(newName);

      await interaction.update({ components: [] });
      await channel.send(`✅ Ticket claimed by Master <@${user.id}>`);

      // Send DM to user (if possible)
      const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
      if (ticketUser) {
        await safeDM(
          ticketUser.user,
          `💬 Your ticket has been claimed by <@${user.id}>. They will assist you soon.`
        );
      }

      // Add Close + Request Help buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close Ticket").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
      );

      await channel.send({ components: [row] });
    } catch (err) {
      console.error("Claim ticket error:", err);
    }
  }

  if (customId === "request_help") {
    try {
      const newName = channel.name.replace(/^.*ticket-/, "❌-unclaimed-ticket-");
      await channel.setName(newName);

      await channel.send(`🆘 <@${user.id}> is requesting help. Ticket reopened for other <@&${STAFF_ROLE_ID}>.`);
      await interaction.update({ components: [] });

      // Optionally DM the ticket user
      const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
      if (ticketUser) {
        await safeDM(
          ticketUser.user,
          `💬 The staff member handling your ticket has requested help. Another staff will assist you shortly.`
        );
      }

      // Re-add buttons for next staff
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim Ticket").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
      );

      await channel.send({ components: [row] });
    } catch (err) {
      console.error("Request help error:", err);
    }
  }

  if (customId === "close_ticket") {
    try {
      await channel.send("🔒 Ticket closed and moved to archive.");
      await interaction.update({ components: [] });

      // Move to archive category
      await channel.setParent(ARCHIVE_CATEGORY_ID);

      // DM the user about closure
      const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
      if (ticketUser) {
        await safeDM(ticketUser.user, "💬 Your ticket has been closed. Thank you for your patience!");
      }
    } catch (err) {
      console.error("Close ticket error:", err);
    }
  }
});

// -----------------------------
// Startup
// -----------------------------
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

client.login(process.env.TOKEN);
