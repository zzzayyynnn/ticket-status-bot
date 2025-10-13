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

// Categories
const GUILD_APP_CATEGORY = "1398363565571969085";
const MASTER_TICKET_CATEGORY = "1399235813379670028";
const APPLICATION_TICKET_CATEGORY = "1403050594670743582";
const MASTER_APPLICATION_CATEGORY = "1407414268965552270";

// -----------------------------
// Ready
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// -----------------------------
// Close button
function createCloseButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("❌ Close Ticket")
      .setStyle(ButtonStyle.Secondary)
  );
}

// -----------------------------
// Auto-claim on message
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const { channel, member, content } = message;

  // Only staff can auto-claim
  if (!member.roles.cache.has(STAFF_ROLE_ID)) return;

  // Only unclaimed tickets
  if (!channel.name.startsWith("❌-unclaimed-ticket-")) return;

  const ticketNumberMatch = channel.name.match(/\d+$/);
  const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : ticketCounter;

  // -----------------------------
  // Master / Guild Tickets (link)
  if ([GUILD_APP_CATEGORY, MASTER_TICKET_CATEGORY].includes(channel.parentId)) {
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (!linkRegex.test(content)) return;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(member.id);
    await channel.send(`✅ Ticket automatically claimed by <@${member.id}>`);
  }

  // -----------------------------
  // Application / Master Application Tickets ("done")
  else if ([APPLICATION_TICKET_CATEGORY, MASTER_APPLICATION_CATEGORY].includes(channel.parentId)) {
    if (!content.toLowerCase().includes("done")) return;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(member.id);
    await channel.send(`✅ Ticket automatically claimed by <@${member.id}>`);
  }
});

// -----------------------------
// Close button interaction
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, user } = interaction;
  const claimerId = channel.topic;

  if (customId === "close_ticket") {
    if (claimerId && claimerId !== user.id) {
      return interaction.reply({ content: `❌ Only the staff who claimed this ticket (<@${claimerId}>) can close it.`, ephemeral: true });
    }

    await interaction.deferUpdate();

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
