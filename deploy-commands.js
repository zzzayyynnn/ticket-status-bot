require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Set the status of a ticket")
    .addStringOption(option =>
      option.setName("state")
        .setDescription("Choose ticket status")
        .setRequired(true)
        .addChoices(
          { name: "Waiting", value: "waiting" },
          { name: "Proceeding", value: "proceeding" },
          { name: "Assisted", value: "assisted" }
        )
    )
].map(command => command.toJSON());

// ⚠️ Gamitin si BOT_TOKEN dito
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("📡 Refreshing application (/) commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands },
    );

    console.log("✅ Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
