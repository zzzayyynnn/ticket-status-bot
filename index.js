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
// Lightweight web server for ping
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
let ticketCounter = 4176; // starting point
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
const STAFF_ROLE_ID = "1421545043214340166"; // staff role
const ARCHIVE_CATEGORY_ID = "1426986618618646688"; // archive category

// -----------------------------
// Helper: safe DM send
// -----------------------------
async function safeDM(user, message) {
  try {
    await user.send(message);
  } catch {
    console.log(`⚠️ Could not DM ${user.tag}`);
  }
}

// -----------------------------
// Events
// -----------------------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Detect new ticket channel
client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel?.guild || !channel.name.startsWith("ticket-")) return;

    // Rename ticket
    const newName = `❌-unclaimed-ticket-${ticketCounter}`;
    await channel.setName(newName);
    ticketCounter++;
    saveCounter();

    // Wait for Ticket Tool to post its message
    setTimeout(async () => {
      const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
      if (!messages) return;

      // Find Ticket Tool message
      const ticketToolMsg = messages.find((m) => m.author.bot && m.author.username.includes("Ticket"));
      if (!ticketToolMsg) return;

      // Add claim/request help buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim Ticket").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: " ",
        reply: { messageReference: ticketToolMsg.id },
        components: [row],
      });

      console.log(`🎟️ Added claim/help buttons in ${channel.name}`);
    }, 4000); // wait 4s for Ticket Tool message to appear
  } catch (err) {
    console.error("ChannelCreate error:", err);
  }
});

// Handle button interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user, channel, guild } = interaction;

  const member = await guild.members.fetch(user.id);
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Only staff can use this.", ephemeral: true });
  }

  // ✅ CLAIM TICKET
  if (customId === "claim_ticket") {
    const newName = channel.name.replace(/^.*ticket-/, "✅-claimed-ticket-");
    await channel.setName(newName);
    await interaction.update({ components: [] });
    await channel.send(`✅ Ticket claimed by Master <@${user.id}>`);

    // DM user (if possible)
    const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
    if (ticketUser) {
      await safeDM(ticketUser.user, `💬 Your ticket has been claimed by <@${user.id}>.`);
    }

    // Add Close + Request Help buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close Ticket").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
    );
    await channel.send({ components: [row] });
  }

  // 🆘 REQUEST HELP
  if (customId === "request_help") {
    const newName = channel.name.replace(/^.*ticket-/, "❌-unclaimed-ticket-");
    await channel.setName(newName);
    await interaction.update({ components: [] });

    await channel.send(`🆘 <@${user.id}> is requesting help. Ticket reopened for other <@&${STAFF_ROLE_ID}>.`);
    const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
    if (ticketUser) {
      await safeDM(ticketUser.user, `💬 The staff member has requested help. Another staff will assist you soon.`);
    }

    // Re-add claim buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim Ticket").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("request_help").setLabel("🆘 Request Help").setStyle(ButtonStyle.Danger)
    );
    await channel.send({ components: [row] });
  }

  // ❌ CLOSE TICKET
  if (customId === "close_ticket") {
    await interaction.update({ components: [] });
    await channel.send("🔒 Ticket closed and moved to archive.");

    await channel.setParent(ARCHIVE_CATEGORY_ID);

    const ticketUser = channel.topic ? await guild.members.fetch(channel.topic).catch(() => null) : null;
    if (ticketUser) {
      await safeDM(ticketUser.user, "💬 Your ticket has been closed. Thank you!");
    }
  }
});

// -----------------------------
// Startup
// -----------------------------
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection:", reason);
});

client.login(process.env.TOKEN);
