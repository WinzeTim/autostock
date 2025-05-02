require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const express = require('express');
const app = express();

// ✅ Use PORT from environment for Render compatibility
const port = process.env.PORT || 3000;

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const channelSelections = {}; // userID -> channelID map

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rest = new REST({ version: '10' }).setToken(token);

// Slash command registration
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to receive stock notifications.')
          .setRequired(true)
      ),
  ].map(command => command.toJSON());

  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

client.once('ready', () => {
  console.log('🤖 Discord bot is ready!');
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'setchannel') {
    const selectedChannel = interaction.options.getChannel('channel');
    channelSelections[interaction.user.id] = selectedChannel.id;
    await interaction.reply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
  }
});

// Express routes
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Stock bot is running. Use POST /send-stock to send data.');
});

app.post('/send-stock', async (req, res) => {
  const stockData = req.body;

  if (!stockData) {
    console.log('⚠️ No stock data received');
    return res.status(400).send('No stock data received');
  }

  console.log('📦 Received stock data:', stockData);

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Shop Stock Update')
    .setDescription('Here are the current shop items available:')
    .setColor(0x58D68D);

  if (stockData.seeds?.length > 0) {
    embed.addFields(stockData.seeds.map(seed => ({
      name: `🌱 ${seed.name}`,
      value: `Stock: ${seed.stock}`,
      inline: true,
    })));
  }

  if (stockData.gears?.length > 0) {
    embed.addFields(stockData.gears.map(gear => ({
      name: `🛠️ ${gear.name}`,
      value: `Stock: ${gear.stock}`,
      inline: true,
    })));
  }

  for (const userId in channelSelections) {
    const channelId = channelSelections[userId];
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        await channel.send({ embeds: [embed] });
        console.log(`✅ Sent stock embed to channel ${channel.id}`);
      }
    } catch (err) {
      console.error(`❌ Error sending to channel ${channelId}:`, err);
    }
  }

  res.status(200).send('Stock sent to selected channels.');
});

// Start server
app.listen(port, () => {
  console.log(`🌐 Express server running on http://localhost:${port}`);
});

// Login the bot
client.login(token);
