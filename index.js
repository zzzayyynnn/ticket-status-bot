require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Events,
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

const GUILD_APP_CATEGORY = process.env.GUILD_APP_CATEGORY;
const MASTER_TICKET_CATEGORY = process.env.MASTER_TICKET_CATEGORY;
const APPLICATION_TICKET_CATEGORY = process.env.APPLICATION_TICKET_CATEGORY;
const MASTER_APPLICATION_CATEGORY = process.env.MASTER_APPLICATION_CATEGORY;

// -----------------------------
// Ready
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// -----------------------------
// Handle new ticket creation
client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel.guild) return;

    // Only in ticket categories
    if (![GUILD_APP_CATEGORY, MASTER_TICKET_CATEGORY, APPLICATION_TICKET_CATEGORY, MASTER_APPLICATION_CATEGORY].includes(channel.parentId)) return;

    // Rename new ticket to unclaimed
    const ticketNumber = ticketCounter++;
    await channel.setName(`❌-unclaimed-ticket-${ticketNumber}`);
    await channel.setTopic(null);
    saveCounter();

    // Post notification
    await channel.send(`🎟️ Ticket created. Staff can claim it by sending a link or "done".`);
  } catch (err) {
    console.error("ChannelCreate error:", err);
  }
});

// -----------------------------
// Auto-claim on message
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const { channel, member, content } = message;

  // Only staff
  if (!member.roles.cache.has(STAFF_ROLE_ID)) return;

  // Only unclaimed tickets
  if (!channel.name.startsWith("❌-unclaimed-ticket-")) return;

  const ticketNumberMatch = channel.name.match(/\d+$/);
  const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : ticketCounter;

  // Master / Guild Tickets (link)
  if ([GUILD_APP_CATEGORY, MASTER_TICKET_CATEGORY].includes(channel.parentId)) {
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (!linkRegex.test(content)) return;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(member.id);
    await channel.send(`✅ Ticket automatically claimed by <@${member.id}>`);
  }

  // Application / Master Application Tickets ("done")
  else if ([APPLICATION_TICKET_CATEGORY, MASTER_APPLICATION_CATEGORY].includes(channel.parentId)) {
    if (!content.toLowerCase().includes("done")) return;

    await channel.setName(`✅-claimed-ticket-${ticketNumber}`);
    await channel.setTopic(member.id);
    await channel.send(`✅ Ticket automatically claimed by <@${member.id}>`);
  }
});

// -----------------------------
// Startup
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
client.login(process.env.TOKEN);
