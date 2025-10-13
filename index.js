require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// -----------------------------
// Express server (ping)
const app = express();
app.get("/", (req, res) => res.send("ok"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ping endpoint running on port ${PORT}`));

// -----------------------------
// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// -----------------------------
// Ticket counter
const COUNTER_PATH = path.join(__dirname, "counter.json");
let ticketCounter = 4176;
if (fs.existsSync(COUNTER_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(COUNTER_PATH, "utf8"));
    ticketCounter = data.lastTicket || ticketCounter;
  } catch (err) {
    console.warn("⚠️ Could not read counter.json:", err.message);
  }
}
function saveCounter() {
  try {
    fs.writeFileSync(COUNTER_PATH, JSON.stringify({ lastTicket: ticketCounter }, null, 2));
  } catch (err) {
    console.error("❌ Failed to save counter.json:", err.message);
  }
}

// -----------------------------
// Config from .env
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

// -----------------------------
// Single staff message tracker
const staffButtonMessages = new Map(); // channel.id => message

// -----------------------------
// Ready
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// -----------------------------
// Staff buttons
function createStaffButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("✅ Claim Ticket")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("request_help")
      .setLabel("🆘 Request Help")
      .setStyle(ButtonStyle.Danger)
  );
}

// -----------------------------
// New ticket
client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel?.guild || !channel.name.startsWith("ticket-")) return;

    const match = channel.name.match(/\d+$/);
    const ticketNumber = match ? match[0] : ticketCounter;

    await channel.setName(`❌-unclaimed-ticket-${ticketNumber}`);
    await channel.setTopic(null);
    ticketCounter++;
    saveCounter();

    const msg = await channel.send({
      content: `🎟️ **Staff Controls** — Only staff can interact with these buttons.`,
      components: [createStaffButtons()],
    });
    staffButtonMessages.set(channel.id, msg);

  } catch (err) {
    console.error("ChannelCreate error:", err);
  }
});

// -----------------------------
// Button interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user, channel, guild } = interaction;
  const member = await guild.members.fetch(user.id);

  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Only staff can use this.", ephemeral: true });
  }

  let claimerId = channel.topic || null;

  // -----------------------------
  // CLAIM TICKET
  if (customId === "claim_ticket") {
    if (claimerId && claimerId !== user.id) {
      return interaction.reply({
        content: `❌ This ticket is already claimed by <@${claimerId}>.`,
        ephemeral: true,
      });
    }

    const match = channel.name.match(/\d+$/);
    const ticketNumber = match ? match[0] : ticketCounter;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(user.id);
    claimerId = user.id;

    // Update interaction instantly
    await interaction.update({
      content: `✅ Ticket claimed by <@${user.id}>`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("❌ Close Ticket")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("request_help")
            .setLabel("🆘 Request Help")
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });

    // Delete old staff message if exists
    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) oldMsg.delete().catch(() => null);
    staffButtonMessages.set(channel.id, interaction.message);
  }

  // -----------------------------
  // REQUEST HELP
  if (customId === "request_help") {
    if (claimerId && claimerId !== user.id) {
      return interaction.reply({
        content: `❌ Only the staff who claimed this ticket (<@${claimerId}>) can request help.`,
        ephemeral: true,
      });
    }

    await channel.setTopic(null);
    claimerId = null;

    const match = channel.name.match(/\d+$/);
    const ticketNumber = match ? match[0] : ticketCounter - 1;
    await channel.setName(`❌-unclaimed-ticket-${ticketNumber}`);

    await interaction.update({
      content: `🆘 <@${user.id}> requested help. Ticket is now unclaimed. First <@&${STAFF_ROLE_ID}> to click Claim will take it.`,
      components: [createStaffButtons()],
    });

    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) oldMsg.delete().catch(() => null);
    staffButtonMessages.set(channel.id, interaction.message);
  }

  // -----------------------------
  // CLOSE TICKET with 5-second delete
  if (customId === "close_ticket") {
    if (claimerId && claimerId !== user.id) {
      return interaction.reply({
        content: `❌ Only the staff who claimed this ticket (<@${claimerId}>) can close it.`,
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) oldMsg.delete().catch(() => null);
    staffButtonMessages.delete(channel.id);

    const msg = await channel.send("🔒 Ticket will be deleted in 5 seconds...");

    for (let i = 4; i > 0; i--) {
      await new Promise(res => setTimeout(res, 1000));
      await msg.edit(`🔒 Ticket will be deleted in ${i} seconds...`);
    }

    await channel.delete().catch(() => null);
  }
});

// -----------------------------
// Startup
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
client.login(process.env.TOKEN);
