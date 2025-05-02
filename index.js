require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const express = require('express');
const app = express();
const port = 3000;

const token = process.env.TOKEN;
const mongo = process.env.MONGODB;

const channelSelections = {}; // User ID to channel ID map

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rest = new REST({ version: '10' }).setToken(token);

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
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
}

client.once('ready', () => {
  console.log('Bot is ready!');
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

// Root URL for browser access
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running. Use POST /send-stock to send data.');
});

// Handle POST request from Roblox
app.use(express.json());

app.post('/send-stock', (req, res) => {
  const stockData = req.body;
  if (!stockData) return res.status(400).send('No stock data received');

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
    const channel = client.channels.cache.get(channelSelections[userId]);
    if (channel) {
      channel.send({ embeds: [embed] }).catch(console.error);
    }
  }

  res.status(200).send('Stock sent to selected channels.');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

client.login(token);
