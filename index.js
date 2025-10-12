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
  PermissionFlagsBits,
} = require("discord.js");

// -----------------------------
// Express server
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
// Config
const STAFF_ROLE_ID = "1421545043214340166";
const ARCHIVE_CATEGORY_ID = "1426986618618646688";

// -----------------------------
// Store staff button messages
const staffButtonMessages = new Map(); // key = channel.id, value = message

// -----------------------------
// Safe DM
async function safeDM(user, message) {
  try {
    await user.send(message);
  } catch {
    console.log(`⚠️ Could not DM ${user.tag}`);
  }
}

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
    await channel.setTopic(null); // no claimer yet
    ticketCounter++;
    saveCounter();

    setTimeout(async () => {
      if (!channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.SendMessages)) return;
      const msg = await channel.send({
        content: `🎟️ **Staff Controls** — Only staff can interact with these buttons.`,
        components: [createStaffButtons()],
      });
      staffButtonMessages.set(channel.id, msg); // save message
    }, 2000);
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

  // Only staff can interact
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Only staff can use this.", ephemeral: true });
  }

  let claimerId = channel.topic || null;

  // -----------------------------
  // CLAIM TICKET
  if (customId === "claim_ticket") {
    await interaction.deferUpdate();

    if (claimerId && claimerId !== user.id) {
      return interaction.followUp({
        content: `❌ This ticket is already claimed by <@${claimerId}>.`,
        ephemeral: true,
      });
    }

    // Delete previous buttons message if exists
    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) {
      await oldMsg.delete().catch(() => null);
      staffButtonMessages.delete(channel.id);
    }

    const match = channel.name.match(/\d+$/);
    const ticketNumber = match ? match[0] : ticketCounter;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(user.id);
    claimerId = user.id;

    // Always send a new message after claim
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("❌ Close Ticket")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("request_help")
        .setLabel("🆘 Request Help")
        .setStyle(ButtonStyle.Danger)
    );

    const newMsg = await channel.send({
      content: `✅ Ticket claimed by <@${user.id}>`,
      components: [row],
    });
    staffButtonMessages.set(channel.id, newMsg);

    const ticketUser = claimerId ? await guild.members.fetch(claimerId).catch(() => null) : null;
    if (ticketUser) await safeDM(ticketUser.user, `💬 Your ticket has been claimed by <@${user.id}>.`);
  }

  // -----------------------------
  // REQUEST HELP
  if (customId === "request_help") {
    await interaction.deferUpdate();

    if (claimerId && claimerId !== user.id) {
      return interaction.followUp({
        content: `❌ Only the staff who claimed this ticket (<@${claimerId}>) can request help.`,
        ephemeral: true,
      });
    }

    // Delete previous buttons message if exists
    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) {
      await oldMsg.delete().catch(() => null);
      staffButtonMessages.delete(channel.id);
    }

    await channel.setTopic(null);
    claimerId = null;

    const match = channel.name.match(/\d+$/);
    const ticketNumber = match ? match[0] : ticketCounter - 1;
    await channel.setName(`❌-unclaimed-ticket-${ticketNumber}`);

    const msg = await channel.send({
      content: `🆘 <@${user.id}> requested help. Ticket is now unclaimed. First <@&${STAFF_ROLE_ID}> to click Claim will take it.`,
      components: [createStaffButtons()],
    });
    staffButtonMessages.set(channel.id, msg);
  }

  // -----------------------------
  // CLOSE TICKET
  if (customId === "close_ticket") {
    await interaction.deferUpdate();

    if (claimerId && claimerId !== user.id) {
      return interaction.followUp({
        content: `❌ Only the staff who claimed this ticket (<@${claimerId}>) can close it.`,
        ephemeral: true,
      });
    }

    // Delete previous buttons message if exists
    const oldMsg = staffButtonMessages.get(channel.id);
    if (oldMsg) {
      await oldMsg.delete().catch(() => null);
      staffButtonMessages.delete(channel.id);
    }

    await channel.send("🔒 Ticket closed and moved to archive.");
    await channel.setParent(ARCHIVE_CATEGORY_ID);

    await channel.permissionOverwrites.set([
      { id: channel.guild.roles.everyone.id, deny: ['ViewChannel'] },
      { id: STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageChannels'] },
    ]);

    const ticketUser = claimerId ? await guild.members.fetch(claimerId).catch(() => null) : null;
    if (ticketUser) await safeDM(ticketUser.user, "💬 Your ticket has been closed. Thank you for your patience!");
  }
});

// -----------------------------
// Startup
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
client.login(process.env.TOKEN);
